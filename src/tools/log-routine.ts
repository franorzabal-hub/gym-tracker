import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import {
  getActiveProgram,
  inferTodayDay,
} from "../helpers/program-helpers.js";
import { checkPRs } from "../helpers/stats-calculator.js";

export function registerLogRoutineTool(server: McpServer) {
  server.tool(
    "log_routine",
    `Log an entire routine day at once. This is for when the user says something like "hice la rutina de hoy" or "completed today's workout".
Infers the program day from the active program + today's weekday, or uses the provided program_day label.

You can override specific exercises (different weight/reps) or skip exercises entirely.
Each exercise from the day template gets logged with its target sets/reps/weight.

Parameters:
- program_day: day label to log (e.g. "Push"). If omitted, infers from today's weekday.
- overrides: array of { exercise, sets?, reps?, weight?, rpe? } to override template values
- skip: array of exercise names to skip`,
    {
      program_day: z.string().optional(),
      overrides: z
        .array(
          z.object({
            exercise: z.string(),
            sets: z.number().int().optional(),
            reps: z.number().int().optional(),
            weight: z.number().optional(),
            rpe: z.number().optional(),
          })
        )
        .optional(),
      skip: z.array(z.string()).optional(),
    },
    async ({ program_day, overrides, skip }) => {
      const activeProgram = await getActiveProgram();
      if (!activeProgram) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No active program found" }),
            },
          ],
          isError: true,
        };
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
        dayRow = await inferTodayDay(activeProgram.id);
      }

      if (!dayRow) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "No program day found for today. Specify a day label or check program weekday assignments.",
              }),
            },
          ],
          isError: true,
        };
      }

      // Get exercises for this day
      const { rows: dayExercises } = await pool.query(
        `SELECT pde.*, e.name as exercise_name, e.id as exercise_id
         FROM program_day_exercises pde
         JOIN exercises e ON e.id = pde.exercise_id
         WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
        [dayRow.id]
      );

      // Build skip set (normalized)
      const skipSet = new Set(
        (skip || []).map((s) => s.toLowerCase().trim())
      );

      // Build override map
      const overrideMap = new Map<string, any>();
      for (const o of overrides || []) {
        const resolved = await resolveExercise(o.exercise);
        overrideMap.set(resolved.name.toLowerCase(), o);
      }

      // Create session
      const { rows: [session] } = await pool.query(
        `INSERT INTO sessions (program_version_id, program_day_id)
         VALUES ($1, $2) RETURNING id, started_at`,
        [activeProgram.version_id, dayRow.id]
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
        const { rows: [se] } = await pool.query(
          `INSERT INTO session_exercises (session_id, exercise_id, sort_order, superset_group)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [session.id, dex.exercise_id, dex.sort_order, dex.superset_group]
        );

        // Insert sets
        const setIds: number[] = [];
        for (let i = 0; i < sets; i++) {
          const { rows: [s] } = await pool.query(
            `INSERT INTO sets (session_exercise_id, set_number, reps, weight, rpe)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [se.id, i + 1, reps, weight || null, rpe || null]
          );
          setIds.push(s.id);
        }

        totalSets += sets;
        if (weight) totalVolume += weight * reps * sets;

        // Check PRs
        const prs = await checkPRs(
          dex.exercise_id,
          setIds.map((id, i) => ({
            reps,
            weight: weight ?? null,
            set_id: id,
          }))
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

      // End session immediately
      await pool.query(
        "UPDATE sessions SET ended_at = NOW() WHERE id = $1",
        [session.id]
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              session_id: session.id,
              day_label: dayRow.day_label,
              exercises_logged: exercisesLogged,
              total_sets: totalSets,
              total_volume_kg: Math.round(totalVolume),
              new_prs: allPRs.length > 0 ? allPRs : undefined,
            }),
          },
        ],
      };
    }
  );
}
