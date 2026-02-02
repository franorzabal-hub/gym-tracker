import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerHistoryTool(server: McpServer) {
  server.registerTool("get_history", {
    description: `${APP_CONTEXT}Get workout history. Shows past sessions with exercises and sets.
Use period to filter: "today", "week", "month", "year", or a number of days.
Optionally filter by exercise name or program_day label.
Use session_id to fetch a specific session by ID (ignores other filters).
Use limit/offset for pagination. Use summary_only for lightweight summaries.

Examples:
- "¿qué entrené esta semana?" → period: "week"
- "historial de press banca" → exercise: "press banca"
- "¿qué hice hoy?" → period: "today"`,
    inputSchema: {
      period: z
        .union([
          z.enum(["today", "week", "month", "year"]),
          z.number().int().min(1),
        ])
        .optional()
        .default("week"),
      exercise: z.string().optional(),
      program_day: z.string().optional(),
      tags: z.union([z.array(z.string()), z.string()]).optional().describe("Filter sessions that have ALL of these tags"),
      session_id: z.number().int().optional().describe("Fetch a specific session by ID (ignores period/filters)"),
      limit: z.number().int().optional().describe("Max sessions to return. Defaults to 50"),
      offset: z.number().int().optional().describe("Skip first N sessions for pagination. Defaults to 0"),
      summary_only: z.boolean().optional().describe("If true, return only session summaries without exercise/set details"),
      include_sets: z.boolean().optional().describe("If true, include individual set details per exercise. Defaults to true"),
    },
    annotations: { readOnlyHint: true },
  },
    async ({ period, exercise, program_day, tags: rawTags, session_id, limit: rawLimit, offset: rawOffset, summary_only, include_sets }) => {
      const tags = parseJsonArrayParam<string>(rawTags);
      const userId = getUserId();
      const effectiveLimit = rawLimit ?? 50;
      const effectiveOffset = rawOffset ?? 0;
      const effectiveIncludeSets = include_sets ?? true;

      const params: any[] = [userId];

      // --- session_id mode: fetch single session, ignore other filters ---
      if (session_id != null) {
        params.push(session_id);

        if (summary_only) {
          const sql = `
            SELECT s.id as session_id, s.started_at, s.ended_at,
              pd.day_label as program_day, s.tags,
              COUNT(DISTINCT se.id) as exercises_count,
              COALESCE(SUM((SELECT COUNT(*) FROM sets st WHERE st.session_exercise_id = se.id)), 0) as total_sets,
              COALESCE(SUM((SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st WHERE st.session_exercise_id = se.id AND st.set_type != 'warmup' AND st.weight IS NOT NULL)), 0) as total_volume_kg
            FROM sessions s
            LEFT JOIN program_days pd ON pd.id = s.program_day_id
            LEFT JOIN session_exercises se ON se.session_id = s.id
            WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.id = $2
            GROUP BY s.id, pd.day_label, s.tags`;

          const { rows: sessions } = await pool.query(sql, params);
          const mapped = sessions.map(s => ({
            session_id: s.session_id,
            started_at: s.started_at,
            ended_at: s.ended_at,
            program_day: s.program_day,
            tags: s.tags,
            exercises_count: Number(s.exercises_count),
            total_sets: Number(s.total_sets),
            total_volume_kg: Math.round(Number(s.total_volume_kg)),
          }));

          const summary = {
              total_sessions: mapped.length,
              total_volume_kg: mapped.reduce((acc, s) => acc + s.total_volume_kg, 0),
              exercises_count: mapped.reduce((acc, s) => acc + s.exercises_count, 0),
            };
          return toolResponse({ sessions: mapped, summary });
        }

        // Full session with exercises (and optionally sets)
        let sql: string;
        if (effectiveIncludeSets) {
          sql = `
            SELECT s.id as session_id, s.started_at, s.ended_at,
              pd.day_label as program_day, s.tags,
              COALESCE(json_agg(
                json_build_object(
                  'exercise', e.name,
                  'sets', (
                    SELECT COALESCE(json_agg(
                      json_build_object(
                        'set_id', st.id,
                        'set_number', st.set_number,
                        'reps', st.reps,
                        'weight', st.weight,
                        'rpe', st.rpe,
                        'set_type', st.set_type,
                        'notes', st.notes
                      ) ORDER BY st.set_number
                    ), '[]')
                    FROM sets st WHERE st.session_exercise_id = se.id
                  )
                ) ORDER BY se.sort_order
              ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
            FROM sessions s
            LEFT JOIN program_days pd ON pd.id = s.program_day_id
            LEFT JOIN session_exercises se ON se.session_id = s.id
            LEFT JOIN exercises e ON e.id = se.exercise_id
            WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.id = $2
            GROUP BY s.id, pd.day_label, s.tags
            ORDER BY s.started_at DESC`;
        } else {
          sql = `
            SELECT s.id as session_id, s.started_at, s.ended_at,
              pd.day_label as program_day, s.tags,
              COALESCE(json_agg(
                json_build_object(
                  'exercise', e.name,
                  'total_sets', (SELECT COUNT(*) FROM sets st WHERE st.session_exercise_id = se.id),
                  'total_volume_kg', (SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st WHERE st.session_exercise_id = se.id AND st.set_type != 'warmup' AND st.weight IS NOT NULL)
                ) ORDER BY se.sort_order
              ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
            FROM sessions s
            LEFT JOIN program_days pd ON pd.id = s.program_day_id
            LEFT JOIN session_exercises se ON se.session_id = s.id
            LEFT JOIN exercises e ON e.id = se.exercise_id
            WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.id = $2
            GROUP BY s.id, pd.day_label, s.tags
            ORDER BY s.started_at DESC`;
        }

        const { rows: sessions } = await pool.query(sql, params);

        let totalVolume = 0;
        const exerciseSet = new Set<string>();
        for (const session of sessions) {
          if (session.exercises) {
            for (const ex of session.exercises) {
              if (ex.exercise) exerciseSet.add(ex.exercise);
              if (effectiveIncludeSets && ex.sets) {
                for (const set of ex.sets) {
                  if (set.weight && set.reps && set.set_type !== "warmup") {
                    totalVolume += set.weight * set.reps;
                  }
                }
              } else if (!effectiveIncludeSets && ex.total_volume_kg) {
                totalVolume += Number(ex.total_volume_kg);
              }
            }
          }
        }

        const summary = {
            total_sessions: sessions.length,
            total_volume_kg: Math.round(totalVolume),
            exercises_count: exerciseSet.size,
          };
        return toolResponse({ sessions, summary });
      }

      // --- Normal mode: period-based filtering ---

      // Build date filter using user's timezone
      const userDate = await getUserCurrentDate();
      let dateFilter: string;
      if (period === "today") {
        params.push(userDate);
        dateFilter = `s.started_at >= $${params.length}::date`;
      } else if (period === "week") {
        params.push(userDate);
        dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '7 days'`;
      } else if (period === "month") {
        params.push(userDate);
        dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '30 days'`;
      } else if (period === "year") {
        params.push(userDate);
        dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '365 days'`;
      } else {
        params.push(userDate);
        params.push(period);
        dateFilter = `s.started_at >= $${params.length - 1}::date - make_interval(days => $${params.length})`;
      }

      // Build WHERE clause additions
      let extraWhere = "";

      if (exercise) {
        params.push(`%${exercise}%`);
        extraWhere += ` AND EXISTS (
          SELECT 1 FROM session_exercises se2
          JOIN exercises e2 ON e2.id = se2.exercise_id
          LEFT JOIN exercise_aliases ea ON ea.exercise_id = e2.id
          WHERE se2.session_id = s.id
            AND (e2.name ILIKE $${params.length} OR ea.alias ILIKE $${params.length})
        )`;
      }

      if (program_day) {
        params.push(program_day.toLowerCase());
        extraWhere += ` AND LOWER(pd.day_label) = $${params.length}`;
      }

      if (tags && tags.length > 0) {
        params.push(tags);
        extraWhere += ` AND s.tags @> $${params.length}::text[]`;
      }

      // Add LIMIT and OFFSET params
      params.push(effectiveLimit);
      const limitIdx = params.length;
      params.push(effectiveOffset);
      const offsetIdx = params.length;

      if (summary_only) {
        const sql = `
          SELECT s.id as session_id, s.started_at, s.ended_at,
            pd.day_label as program_day, s.tags,
            COUNT(DISTINCT se.id) as exercises_count,
            COALESCE(SUM((SELECT COUNT(*) FROM sets st WHERE st.session_exercise_id = se.id)), 0) as total_sets,
            COALESCE(SUM((SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st WHERE st.session_exercise_id = se.id AND st.set_type != 'warmup' AND st.weight IS NOT NULL)), 0) as total_volume_kg
          FROM sessions s
          LEFT JOIN program_days pd ON pd.id = s.program_day_id
          LEFT JOIN session_exercises se ON se.session_id = s.id
          WHERE s.user_id = $1 AND s.deleted_at IS NULL AND ${dateFilter}${extraWhere}
          GROUP BY s.id, pd.day_label, s.tags
          ORDER BY s.started_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

        const { rows: sessions } = await pool.query(sql, params);
        const mapped = sessions.map(s => ({
          session_id: s.session_id,
          started_at: s.started_at,
          ended_at: s.ended_at,
          program_day: s.program_day,
          tags: s.tags,
          exercises_count: Number(s.exercises_count),
          total_sets: Number(s.total_sets),
          total_volume_kg: Math.round(Number(s.total_volume_kg)),
        }));

        const summary = {
            total_sessions: mapped.length,
            total_volume_kg: mapped.reduce((acc, s) => acc + s.total_volume_kg, 0),
            exercises_count: mapped.reduce((max, s) => max + s.exercises_count, 0),
          };
        return toolResponse({ sessions: mapped, summary });
      }

      // Full mode (with or without sets)
      let sql: string;
      if (effectiveIncludeSets) {
        sql = `
          SELECT s.id as session_id, s.started_at, s.ended_at,
            pd.day_label as program_day, s.tags,
            COALESCE(json_agg(
              json_build_object(
                'exercise', e.name,
                'sets', (
                  SELECT COALESCE(json_agg(
                    json_build_object(
                      'set_id', st.id,
                      'set_number', st.set_number,
                      'reps', st.reps,
                      'weight', st.weight,
                      'rpe', st.rpe,
                      'set_type', st.set_type,
                      'notes', st.notes
                    ) ORDER BY st.set_number
                  ), '[]')
                  FROM sets st WHERE st.session_exercise_id = se.id
                )
              ) ORDER BY se.sort_order
            ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
          FROM sessions s
          LEFT JOIN program_days pd ON pd.id = s.program_day_id
          LEFT JOIN session_exercises se ON se.session_id = s.id
          LEFT JOIN exercises e ON e.id = se.exercise_id
          WHERE s.user_id = $1 AND s.deleted_at IS NULL AND ${dateFilter}${extraWhere}
          GROUP BY s.id, pd.day_label, s.tags
          ORDER BY s.started_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      } else {
        sql = `
          SELECT s.id as session_id, s.started_at, s.ended_at,
            pd.day_label as program_day, s.tags,
            COALESCE(json_agg(
              json_build_object(
                'exercise', e.name,
                'total_sets', (SELECT COUNT(*) FROM sets st WHERE st.session_exercise_id = se.id),
                'total_volume_kg', (SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st WHERE st.session_exercise_id = se.id AND st.set_type != 'warmup' AND st.weight IS NOT NULL)
              ) ORDER BY se.sort_order
            ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
          FROM sessions s
          LEFT JOIN program_days pd ON pd.id = s.program_day_id
          LEFT JOIN session_exercises se ON se.session_id = s.id
          LEFT JOIN exercises e ON e.id = se.exercise_id
          WHERE s.user_id = $1 AND s.deleted_at IS NULL AND ${dateFilter}${extraWhere}
          GROUP BY s.id, pd.day_label, s.tags
          ORDER BY s.started_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      }

      const { rows: sessions } = await pool.query(sql, params);

      // Summary
      const totalSessions = sessions.length;
      let totalVolume = 0;
      const exerciseSet = new Set<string>();

      for (const session of sessions) {
        if (session.exercises) {
          for (const ex of session.exercises) {
            if (ex.exercise) exerciseSet.add(ex.exercise);
            if (effectiveIncludeSets && ex.sets) {
              for (const set of ex.sets) {
                if (set.weight && set.reps && set.set_type !== "warmup") {
                  totalVolume += set.weight * set.reps;
                }
              }
            } else if (!effectiveIncludeSets && ex.total_volume_kg) {
              totalVolume += Number(ex.total_volume_kg);
            }
          }
        }
      }

      const summary = {
          total_sessions: totalSessions,
          total_volume_kg: Math.round(totalVolume),
          exercises_count: exerciseSet.size,
        };
      return toolResponse({ sessions, summary });
    }
  );
}
