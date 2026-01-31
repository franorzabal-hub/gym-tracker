import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import {
  getActiveProgram,
  inferTodayDay,
} from "../helpers/program-helpers.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam, parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

export function registerLogRoutineTool(server: McpServer) {
  registerAppToolWithMeta(server, "log_routine", {
    title: "Log Routine",
    description: `Log an entire routine day at once. This is for when the user says something like "hice la rutina de hoy" or "completed today's workout".
Infers the program day from the active program + today's weekday, or uses the provided program_day label.

You can override specific exercises (different weight/reps) or skip exercises entirely.
Each exercise from the day template gets logged with its target sets/reps/weight.

Parameters:
- program_day: day label to log (e.g. "Push"). If omitted, infers from today's weekday.
- overrides: array of { exercise, sets?, reps?, weight?, rpe? } to override template values
- skip: array of exercise names to skip
- auto_end: whether to auto-close the session (default true). Set false to keep it open for additional exercises.`,
    inputSchema: {
      program_day: z.string().optional(),
      overrides: z.union([
        z.array(
          z.object({
            exercise: z.string(),
            sets: z.number().int().optional(),
            reps: z.number().int().optional(),
            weight: z.number().optional(),
            rpe: z.number().optional(),
          })
        ),
        z.string(),
      ]).optional(),
      skip: z.union([z.array(z.string()), z.string()]).optional(),
      auto_end: z.boolean().optional().describe("Whether to auto-close the session after logging. Default true. Set false to keep session open for additional exercises."),
      date: z.string().optional().describe("ISO date (e.g. '2025-01-28') to backdate the session. Defaults to now."),
      tags: z.union([z.array(z.string()), z.string()]).optional().describe("Tags to label this session (e.g. ['deload', 'morning'])"),
      minimal_response: z.boolean().optional().describe("If true, return only success status and new PRs, without echoing back all logged data"),
    },
    annotations: { readOnlyHint: false },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/session.html" },
    },
  }, async ({ program_day, overrides: rawOverrides, skip: rawSkip, auto_end, date, tags: rawTags, minimal_response }) => {
      const userId = getUserId();

      // Some MCP clients serialize nested arrays as JSON strings
      const overrides = parseJsonParam<any[]>(rawOverrides);
      const skip = parseJsonParam<string[]>(rawSkip);
      const tags = parseJsonArrayParam<string>(rawTags);

      // Resolve program and day info before starting the transaction
      const activeProgram = await getActiveProgram();
      if (!activeProgram) {
        return toolResponse({ error: "No active program found" }, true);
      }

      // Find the day
      let dayRow: any;
      if (program_day) {
        const { rows } = await pool.query(
          `SELECT pd.id, pd.day_label FROM program_days pd
           WHERE pd.version_id = $1 AND LOWER(pd.day_label) = LOWER($2) LIMIT 1`,
          [activeProgram.version_id, program_day]
        );
        dayRow = rows[0];
      } else {
        // Infer from weekday using user's timezone
        const { rows: profileRows } = await pool.query(
          "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        const timezone = profileRows[0]?.timezone || undefined;
        dayRow = await inferTodayDay(activeProgram.id, timezone);
      }

      if (!dayRow) {
        return toolResponse({
                error: "No program day found for today. Specify a day label or check program weekday assignments.",
              }, true);
      }

      // Get exercises for this day
      const { rows: dayExercises } = await pool.query(
        `SELECT pde.*, e.name as exercise_name, e.id as exercise_id, e.exercise_type
         FROM program_day_exercises pde
         JOIN exercises e ON e.id = pde.exercise_id
         WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
        [dayRow.id]
      );

      // Build skip set (normalized)
      const skipSet = new Set(
        (skip || []).map((s: string) => s.toLowerCase().trim())
      );

      // Build override map
      const overrideMap = new Map<string, any>();
      for (const o of overrides || []) {
        const resolved = await resolveExercise(o.exercise);
        overrideMap.set(resolved.name.toLowerCase(), o);
      }

      // Start transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Check for already active session inside the transaction
        const active = await client.query(
          "SELECT id, started_at FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
          [userId]
        );
        if (active.rows.length > 0) {
          await client.query("ROLLBACK");
          return toolResponse({
                  error: "There is already an active session. End it first or use log_exercise to add exercises to it.",
                  session_id: active.rows[0].id,
                  started_at: active.rows[0].started_at,
                }, true);
        }

        // Create session
        const startedAt = date ? new Date(date + 'T00:00:00') : new Date();
        const { rows: [session] } = await client.query(
          `INSERT INTO sessions (user_id, program_version_id, program_day_id, started_at, tags)
           VALUES ($1, $2, $3, $4, $5) RETURNING id, started_at`,
          [userId, activeProgram.version_id, dayRow.id, startedAt, tags || []]
        );

        const exercisesLogged: any[] = [];
        let totalSets = 0;
        let totalVolume = 0;
        const allPRs: any[] = [];

        for (const dex of dayExercises) {
          // Check skip
          if (
            skipSet.has(dex.exercise_name.toLowerCase()) ||
            skipSet.has(dex.exercise_id.toString())
          ) {
            continue;
          }

          // Apply overrides
          const override = overrideMap.get(dex.exercise_name.toLowerCase());
          const sets = override?.sets || dex.target_sets;
          const reps = override?.reps || dex.target_reps;
          const weight = override?.weight ?? dex.target_weight;
          const rpe = override?.rpe ?? dex.target_rpe;

          // Create session_exercise
          const { rows: [se] } = await client.query(
            `INSERT INTO session_exercises (session_id, exercise_id, sort_order, superset_group, rest_seconds)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [session.id, dex.exercise_id, dex.sort_order, dex.superset_group, dex.rest_seconds || null]
          );

          // Insert sets
          const setIds: number[] = [];
          for (let i = 0; i < sets; i++) {
            const { rows: [s] } = await client.query(
              `INSERT INTO sets (session_exercise_id, set_number, reps, weight, rpe)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [se.id, i + 1, reps, weight || null, rpe || null]
            );
            setIds.push(s.id);
          }

          totalSets += sets;
          if (weight) totalVolume += weight * reps * sets;

          // Check PRs (pass client for transaction safety)
          const prs = await checkPRs(
            dex.exercise_id,
            setIds.map((id, i) => ({
              reps,
              weight: weight ?? null,
              set_id: id,
            })),
            dex.exercise_type,
            client
          );
          if (prs.length > 0) allPRs.push({ exercise: dex.exercise_name, prs });

          exercisesLogged.push({
            exercise: dex.exercise_name,
            sets,
            reps,
            weight: weight || undefined,
            rpe: rpe || undefined,
          });
        }

        // End session unless auto_end is explicitly false
        const shouldEnd = auto_end !== false;
        if (shouldEnd) {
          const endedAt = date ? new Date(new Date(date + 'T00:00:00').getTime() + 60 * 60 * 1000) : new Date();
          await client.query(
            "UPDATE sessions SET ended_at = $2 WHERE id = $1 AND user_id = $3",
            [session.id, endedAt, userId]
          );
        }

        await client.query("COMMIT");

        if (minimal_response) {
          return toolResponse({
                  success: true,
                  session_id: session.id,
                  exercises_logged: exercisesLogged.length,
                  new_prs: allPRs.length > 0 ? allPRs : undefined,
                });
        }

        return toolResponse({
                session_id: session.id,
                day_label: dayRow.day_label,
                exercises_logged: exercisesLogged,
                total_sets: totalSets,
                total_volume_kg: Math.round(totalVolume),
                new_prs: allPRs.length > 0 ? allPRs : undefined,
                session_ended: shouldEnd,
                ...(shouldEnd ? {} : { hint: "Session is still open. Use log_exercise to add more exercises, then end_session when done." }),
              });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
