import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import { estimateE1RM } from "../helpers/stats-calculator.js";

export function registerStatsTool(server: McpServer) {
  server.tool(
    "get_stats",
    `Get detailed statistics for a specific exercise. Shows personal records, progression over time, volume trends, and training frequency.

Examples:
- "¿cómo voy en sentadilla?" → exercise: "sentadilla"
- "stats de press banca del último mes" → exercise: "press banca", period: "month"
- "¿cuánto levanto en peso muerto?" → exercise: "peso muerto"`,
    {
      exercise: z.string(),
      period: z
        .enum(["month", "3months", "year", "all"])
        .optional()
        .default("3months"),
    },
    async ({ exercise, period }) => {
      const resolved = await resolveExercise(exercise);

      // Date filters (different aliases depending on query context)
      let setsDateFilter: string;
      let sessionsDateFilter: string;
      switch (period) {
        case "month":
          setsDateFilter = "AND st.logged_at >= CURRENT_DATE - INTERVAL '30 days'";
          sessionsDateFilter = "AND s.started_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case "3months":
          setsDateFilter = "AND st.logged_at >= CURRENT_DATE - INTERVAL '90 days'";
          sessionsDateFilter = "AND s.started_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        case "year":
          setsDateFilter = "AND st.logged_at >= CURRENT_DATE - INTERVAL '365 days'";
          sessionsDateFilter = "AND s.started_at >= CURRENT_DATE - INTERVAL '365 days'";
          break;
        default:
          setsDateFilter = "";
          sessionsDateFilter = "";
      }

      // Personal records
      const { rows: prs } = await pool.query(
        `SELECT record_type, value, achieved_at
         FROM personal_records WHERE exercise_id = $1
         ORDER BY record_type`,
        [resolved.id]
      );

      const prMap: Record<string, { value: number; achieved_at: string }> = {};
      for (const pr of prs) {
        prMap[pr.record_type] = {
          value: pr.value,
          achieved_at: pr.achieved_at,
        };
      }

      // Progression: best set per session
      const { rows: progression } = await pool.query(
        `SELECT
           DATE(s.started_at) as date,
           MAX(st.weight) as max_weight,
           MAX(st.reps) FILTER (WHERE st.weight = (SELECT MAX(st2.weight) FROM sets st2 WHERE st2.session_exercise_id = se.id)) as reps_at_max
         FROM sets st
         JOIN session_exercises se ON se.id = st.session_exercise_id
         JOIN sessions s ON s.id = se.session_id
         WHERE se.exercise_id = $1 AND st.set_type = 'working' AND st.weight IS NOT NULL
           ${setsDateFilter}
         GROUP BY DATE(s.started_at), se.id
         ORDER BY date`,
        [resolved.id]
      );

      const progressionData = progression.map((row) => ({
        date: row.date,
        weight: row.max_weight,
        reps: row.reps_at_max,
        estimated_1rm: row.max_weight && row.reps_at_max
          ? estimateE1RM(row.max_weight, row.reps_at_max)
          : null,
      }));

      // Volume trend by week
      const { rows: volumeTrend } = await pool.query(
        `SELECT
           DATE_TRUNC('week', s.started_at) as week,
           SUM(st.weight * st.reps) as total_volume_kg
         FROM sets st
         JOIN session_exercises se ON se.id = st.session_exercise_id
         JOIN sessions s ON s.id = se.session_id
         WHERE se.exercise_id = $1 AND st.set_type = 'working' AND st.weight IS NOT NULL
           ${setsDateFilter}
         GROUP BY week
         ORDER BY week`,
        [resolved.id]
      );

      // Frequency
      const { rows: [freq] } = await pool.query(
        `SELECT
           COUNT(DISTINCT s.id) as total_sessions,
           EXTRACT(DAYS FROM (NOW() - MIN(s.started_at))) as span_days
         FROM sessions s
         JOIN session_exercises se ON se.session_id = s.id
         WHERE se.exercise_id = $1
           ${sessionsDateFilter}`,
        [resolved.id]
      );

      const spanWeeks = Math.max(1, (freq.span_days || 7) / 7);
      const sessionsPerWeek =
        Math.round((Number(freq.total_sessions) / spanWeeks) * 10) / 10;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              exercise: resolved.name,
              personal_records: prMap,
              progression: progressionData,
              volume_trend: volumeTrend.map((v) => ({
                week: v.week,
                total_volume_kg: Math.round(Number(v.total_volume_kg)),
              })),
              frequency: {
                total_sessions: Number(freq.total_sessions),
                sessions_per_week: sessionsPerWeek,
              },
            }),
          },
        ],
      };
    }
  );
}
