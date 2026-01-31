import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { findExercise } from "../helpers/exercise-resolver.js";
import { estimateE1RM } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";

export function registerStatsTool(server: McpServer) {
  server.tool(
    "get_stats",
    `Get detailed statistics for one or more exercises. Shows personal records, progression over time, volume trends, and training frequency.

Single mode: pass "exercise" (string) for one exercise.
Multi mode: pass "exercises" (string[]) for multiple exercises at once. Returns an array of stats.

Examples:
- "¿cómo voy en sentadilla?" → exercise: "sentadilla"
- "stats de press banca del último mes" → exercise: "press banca", period: "month"
- "¿cuánto levanto en peso muerto?" → exercise: "peso muerto"
- "stats de press banca, sentadilla y peso muerto" → exercises: ["press banca", "sentadilla", "peso muerto"]`,
    {
      exercise: z.string().optional(),
      exercises: z.union([z.array(z.string()), z.string()]).optional().describe("Array of exercise names for multi-exercise stats"),
      period: z
        .enum(["month", "3months", "year", "all"])
        .optional()
        .default("3months"),
    },
    async ({ exercise, exercises: rawExercises, period }) => {
      const userId = getUserId();

      // Parse exercises array (JSON string workaround)
      let exercisesList = rawExercises as any;
      if (typeof exercisesList === 'string') {
        try { exercisesList = JSON.parse(exercisesList); } catch { exercisesList = null; }
      }

      // Determine which exercises to query
      const exerciseNames: string[] = [];
      if (exercisesList && Array.isArray(exercisesList) && exercisesList.length > 0) {
        exerciseNames.push(...exercisesList);
      } else if (exercise) {
        exerciseNames.push(exercise);
      } else {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide 'exercise' (single) or 'exercises' (multi) parameter" }) }],
          isError: true,
        };
      }

      const userDate = await getUserCurrentDate();
      const results = [];
      for (const exName of exerciseNames) {
        const stats = await getExerciseStats(userId, exName, period, userDate);
        results.push(stats);
      }

      // Single mode: return flat object; multi mode: return array
      if (exerciseNames.length === 1) {
        const single = results[0];
        if (single.error) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(single) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(single) }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ stats: results }) }],
      };
    }
  );
}

async function getExerciseStats(userId: number, exercise: string, period: string, userDate: string): Promise<Record<string, any>> {
  const resolved = await findExercise(exercise);
  if (!resolved) {
    return { exercise, error: `Exercise "${exercise}" not found` };
  }

  let setsDateFilter: string;
  let sessionsDateFilter: string;
  // $3 will be the userDate parameter in queries that use date filters
  switch (period) {
    case "month":
      setsDateFilter = "AND st.logged_at >= $3::date - INTERVAL '30 days'";
      sessionsDateFilter = "AND s.started_at >= $3::date - INTERVAL '30 days'";
      break;
    case "3months":
      setsDateFilter = "AND st.logged_at >= $3::date - INTERVAL '90 days'";
      sessionsDateFilter = "AND s.started_at >= $3::date - INTERVAL '90 days'";
      break;
    case "year":
      setsDateFilter = "AND st.logged_at >= $3::date - INTERVAL '365 days'";
      sessionsDateFilter = "AND s.started_at >= $3::date - INTERVAL '365 days'";
      break;
    default:
      setsDateFilter = "";
      sessionsDateFilter = "";
  }

  const hasDateFilter = setsDateFilter !== "";
  const baseParams = [userId, resolved.id];
  const dateParams = hasDateFilter ? [userId, resolved.id, userDate] : baseParams;

  const { rows: prs } = await pool.query(
    `SELECT record_type, value, achieved_at
     FROM personal_records WHERE user_id = $1 AND exercise_id = $2
     ORDER BY record_type`,
    baseParams
  );

  const prMap: Record<string, { value: number; achieved_at: string }> = {};
  for (const pr of prs) {
    prMap[pr.record_type] = { value: pr.value, achieved_at: pr.achieved_at };
  }

  const { rows: progression } = await pool.query(
    `SELECT
       DATE(s.started_at) as date,
       MAX(st.weight) as max_weight,
       MAX(st.reps) FILTER (WHERE st.weight = (SELECT MAX(st2.weight) FROM sets st2 WHERE st2.session_exercise_id = se.id)) as reps_at_max
     FROM sets st
     JOIN session_exercises se ON se.id = st.session_exercise_id
     JOIN sessions s ON s.id = se.session_id
     WHERE s.user_id = $1 AND se.exercise_id = $2 AND st.set_type = 'working' AND st.weight IS NOT NULL AND s.deleted_at IS NULL
       ${setsDateFilter}
     GROUP BY DATE(s.started_at), se.id
     ORDER BY date`,
    dateParams
  );

  const progressionData = progression.map((row) => ({
    date: row.date,
    weight: row.max_weight,
    reps: row.reps_at_max,
    estimated_1rm: row.max_weight && row.reps_at_max
      ? estimateE1RM(row.max_weight, row.reps_at_max)
      : null,
  }));

  const { rows: volumeTrend } = await pool.query(
    `SELECT
       DATE_TRUNC('week', s.started_at) as week,
       SUM(st.weight * st.reps) as total_volume_kg
     FROM sets st
     JOIN session_exercises se ON se.id = st.session_exercise_id
     JOIN sessions s ON s.id = se.session_id
     WHERE s.user_id = $1 AND se.exercise_id = $2 AND st.set_type = 'working' AND st.weight IS NOT NULL AND s.deleted_at IS NULL
       ${setsDateFilter}
     GROUP BY week
     ORDER BY week`,
    dateParams
  );

  const { rows: [freq] } = await pool.query(
    `SELECT
       COUNT(DISTINCT s.id) as total_sessions,
       EXTRACT(DAYS FROM (NOW() - MIN(s.started_at))) as span_days
     FROM sessions s
     JOIN session_exercises se ON se.session_id = s.id
     WHERE s.user_id = $1 AND se.exercise_id = $2 AND s.deleted_at IS NULL
       ${sessionsDateFilter}`,
    dateParams
  );

  const spanWeeks = Math.max(1, (freq.span_days || 7) / 7);
  const sessionsPerWeek = Math.round((Number(freq.total_sessions) / spanWeeks) * 10) / 10;

  const { rows: prTimeline } = await pool.query(
    `SELECT record_type, value, achieved_at
     FROM pr_history
     WHERE user_id = $1 AND exercise_id = $2
     ORDER BY achieved_at`,
    [userId, resolved.id]
  );

  return {
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
    pr_timeline: prTimeline,
  };
}
