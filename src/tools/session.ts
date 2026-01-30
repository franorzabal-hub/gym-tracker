import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import {
  getActiveProgram,
  inferTodayDay,
  getProgramDaysWithExercises,
} from "../helpers/program-helpers.js";

export function registerSessionTools(server: McpServer) {
  server.tool(
    "start_session",
    `Start a new workout session. Optionally specify a program_day label (e.g. "Push", "Pull", "Legs").
If not specified, it will infer from the active program + today's weekday.
Returns the session info and the exercises planned for that day (if any).`,
    {
      program_day: z.string().optional(),
      notes: z.string().optional(),
    },
    async ({ program_day, notes }) => {
      // Check for already active session
      const active = await pool.query(
        "SELECT id, started_at FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      );
      if (active.rows.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "There is already an active session",
                session_id: active.rows[0].id,
                started_at: active.rows[0].started_at,
              }),
            },
          ],
          isError: true,
        };
      }

      let programVersionId: number | null = null;
      let programDayId: number | null = null;
      let dayInfo: any = null;

      const activeProgram = await getActiveProgram();

      if (activeProgram) {
        programVersionId = activeProgram.version_id;

        if (program_day) {
          // Find by label
          const { rows } = await pool.query(
            `SELECT id, day_label, weekdays FROM program_days
             WHERE version_id = $1 AND LOWER(day_label) = LOWER($2) LIMIT 1`,
            [activeProgram.version_id, program_day]
          );
          if (rows.length > 0) {
            programDayId = rows[0].id;
            dayInfo = rows[0];
          }
        } else {
          // Infer from weekday
          const inferred = await inferTodayDay(activeProgram.id);
          if (inferred) {
            programDayId = inferred.id;
            dayInfo = inferred;
          }
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO sessions (program_version_id, program_day_id, notes)
         VALUES ($1, $2, $3) RETURNING id, started_at`,
        [programVersionId, programDayId, notes || null]
      );

      const result: any = {
        session_id: rows[0].id,
        started_at: rows[0].started_at,
      };

      if (dayInfo && programVersionId) {
        // Get exercises for this day
        const { rows: exercises } = await pool.query(
          `SELECT e.name, pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe, pde.rest_seconds, pde.notes
           FROM program_day_exercises pde
           JOIN exercises e ON e.id = pde.exercise_id
           WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
          [programDayId]
        );
        result.program_day = {
          label: dayInfo.day_label,
          exercises,
        };

        // Get last workout for the same program day (weight reference)
        const { rows: lastSession } = await pool.query(
          `SELECT s.id, s.started_at FROM sessions s
           WHERE s.program_day_id = $1 AND s.ended_at IS NOT NULL
           ORDER BY s.started_at DESC LIMIT 1`,
          [programDayId]
        );
        if (lastSession.length > 0) {
          const { rows: lastExercises } = await pool.query(
            `SELECT e.name,
               json_agg(json_build_object(
                 'set_number', st.set_number,
                 'reps', st.reps,
                 'weight', st.weight,
                 'rpe', st.rpe
               ) ORDER BY st.set_number) as sets
             FROM session_exercises se
             JOIN exercises e ON e.id = se.exercise_id
             JOIN sets st ON st.session_exercise_id = se.id
             WHERE se.session_id = $1
             GROUP BY e.name, se.sort_order
             ORDER BY se.sort_order`,
            [lastSession[0].id]
          );
          result.last_workout = {
            date: lastSession[0].started_at,
            exercises: lastExercises,
          };
        }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

  server.tool(
    "end_session",
    `End the current active workout session. Returns a summary with duration, exercises count, total sets, and total volume.`,
    {
      notes: z.string().optional(),
    },
    async ({ notes }) => {
      const active = await pool.query(
        "SELECT id, started_at FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      );
      if (active.rows.length === 0) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "No active session" }) },
          ],
          isError: true,
        };
      }

      const sessionId = active.rows[0].id;

      await pool.query(
        `UPDATE sessions SET ended_at = NOW(), notes = COALESCE($2, notes)
         WHERE id = $1`,
        [sessionId, notes || null]
      );

      const { rows: [summary] } = await pool.query(
        `SELECT
           s.started_at, s.ended_at,
           EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60 as duration_minutes,
           COUNT(DISTINCT se.id) as exercises_count,
           COUNT(st.id) as total_sets,
           COALESCE(SUM(CASE WHEN st.set_type != 'warmup' THEN st.weight * st.reps ELSE 0 END), 0) as total_volume_kg
         FROM sessions s
         LEFT JOIN session_exercises se ON se.session_id = s.id
         LEFT JOIN sets st ON st.session_exercise_id = se.id
         WHERE s.id = $1
         GROUP BY s.id`,
        [sessionId]
      );

      // Get exercises grouped by superset
      const { rows: exerciseDetails } = await pool.query(
        `SELECT e.name, se.superset_group,
           json_agg(json_build_object(
             'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight, 'rpe', st.rpe, 'set_type', st.set_type
           ) ORDER BY st.set_number) as sets
         FROM session_exercises se
         JOIN exercises e ON e.id = se.exercise_id
         LEFT JOIN sets st ON st.session_exercise_id = se.id
         WHERE se.session_id = $1
         GROUP BY se.id, e.name, se.superset_group, se.sort_order
         ORDER BY se.sort_order`,
        [sessionId]
      );

      // Group exercises by superset_group for display
      const supersets: Record<number, string[]> = {};
      for (const ex of exerciseDetails) {
        if (ex.superset_group != null) {
          if (!supersets[ex.superset_group]) supersets[ex.superset_group] = [];
          supersets[ex.superset_group].push(ex.name);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              session_id: sessionId,
              duration_minutes: Math.round(summary.duration_minutes),
              exercises_count: Number(summary.exercises_count),
              total_sets: Number(summary.total_sets),
              total_volume_kg: Math.round(Number(summary.total_volume_kg)),
              exercises: exerciseDetails.map((e: any) => ({
                name: e.name,
                superset_group: e.superset_group,
                sets: e.sets,
              })),
              supersets: Object.keys(supersets).length > 0 ? supersets : undefined,
            }),
          },
        ],
      };
    }
  );
}
