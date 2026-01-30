import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";

export function registerHistoryTool(server: McpServer) {
  server.tool(
    "get_history",
    `Get workout history. Shows past sessions with exercises and sets.
Use period to filter: "today", "week", "month", "year", or a number of days.
Optionally filter by exercise name or program_day label.

Examples:
- "¿qué entrené esta semana?" → period: "week"
- "historial de press banca" → exercise: "press banca"
- "¿qué hice hoy?" → period: "today"`,
    {
      period: z
        .union([
          z.enum(["today", "week", "month", "year"]),
          z.number().int().min(1),
        ])
        .optional()
        .default("week"),
      exercise: z.string().optional(),
      program_day: z.string().optional(),
    },
    async ({ period, exercise, program_day }) => {
      // Build date filter
      let dateFilter: string;
      if (period === "today") {
        dateFilter = "s.started_at >= CURRENT_DATE";
      } else if (period === "week") {
        dateFilter = "s.started_at >= CURRENT_DATE - INTERVAL '7 days'";
      } else if (period === "month") {
        dateFilter = "s.started_at >= CURRENT_DATE - INTERVAL '30 days'";
      } else if (period === "year") {
        dateFilter = "s.started_at >= CURRENT_DATE - INTERVAL '365 days'";
      } else {
        dateFilter = `s.started_at >= CURRENT_DATE - INTERVAL '${period} days'`;
      }

      let sql = `
        SELECT s.id as session_id, s.started_at, s.ended_at,
          pd.day_label as program_day,
          json_agg(
            json_build_object(
              'exercise', e.name,
              'sets', (
                SELECT json_agg(
                  json_build_object(
                    'set_number', st.set_number,
                    'reps', st.reps,
                    'weight', st.weight,
                    'rpe', st.rpe,
                    'set_type', st.set_type,
                    'notes', st.notes
                  ) ORDER BY st.set_number
                )
                FROM sets st WHERE st.session_exercise_id = se.id
              )
            ) ORDER BY se.sort_order
          ) as exercises
        FROM sessions s
        LEFT JOIN program_days pd ON pd.id = s.program_day_id
        LEFT JOIN session_exercises se ON se.session_id = s.id
        LEFT JOIN exercises e ON e.id = se.exercise_id
        WHERE ${dateFilter}
      `;

      const params: any[] = [];

      if (exercise) {
        params.push(`%${exercise}%`);
        sql += ` AND EXISTS (
          SELECT 1 FROM session_exercises se2
          JOIN exercises e2 ON e2.id = se2.exercise_id
          LEFT JOIN exercise_aliases ea ON ea.exercise_id = e2.id
          WHERE se2.session_id = s.id
            AND (e2.name ILIKE $${params.length} OR ea.alias ILIKE $${params.length})
        )`;
      }

      if (program_day) {
        params.push(program_day.toLowerCase());
        sql += ` AND LOWER(pd.day_label) = $${params.length}`;
      }

      sql += ` GROUP BY s.id, pd.day_label ORDER BY s.started_at DESC`;

      const { rows: sessions } = await pool.query(sql, params);

      // Summary
      const totalSessions = sessions.length;
      let totalVolume = 0;
      const exerciseSet = new Set<string>();

      for (const session of sessions) {
        if (session.exercises) {
          for (const ex of session.exercises) {
            if (ex.exercise) exerciseSet.add(ex.exercise);
            if (ex.sets) {
              for (const set of ex.sets) {
                if (set.weight && set.reps && set.set_type !== "warmup") {
                  totalVolume += set.weight * set.reps;
                }
              }
            }
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              sessions,
              summary: {
                total_sessions: totalSessions,
                total_volume_kg: Math.round(totalVolume),
                exercises_count: exerciseSet.size,
              },
            }),
          },
        ],
      };
    }
  );
}
