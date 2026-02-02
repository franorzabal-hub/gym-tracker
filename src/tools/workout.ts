import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerWorkoutTool(server: McpServer) {
  registerAppToolWithMeta(server, "show_workout", {
    title: "Active Workout",
    description: `${APP_CONTEXT}Display a read-only workout session widget. Shows a session with exercises, sets, previous workout comparison, and PRs.
If session_id is provided, shows that specific session. Otherwise shows the most recent session (active or ended).
If no sessions exist and no session_id given, shows a "no sessions" message.
To edit sets, use edit_log. To log new exercises/sets, use log_workout.
The widget already shows all information visually — do NOT repeat exercises or set details in your response. Just confirm it's displayed or offer next steps.`,
    inputSchema: {
      session_id: z.number().optional().describe("Optional session ID to view a specific (possibly ended) session in read-only mode"),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/workout.html" },
      "openai/toolInvocation/invoking": "Loading workout...",
      "openai/toolInvocation/invoked": "Workout loaded",
    },
  }, async ({ session_id }: { session_id?: number }) => {
    const userId = getUserId();

    let rows;
    if (session_id != null) {
      const result = await pool.query(
        "SELECT id, started_at, ended_at, program_day_id, tags FROM sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1",
        [session_id, userId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        "SELECT id, started_at, ended_at, program_day_id, tags FROM sessions WHERE user_id = $1 AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
        [userId]
      );
      rows = result.rows;
    }

    if (rows.length === 0) {
      return widgetResponse(
        session_id != null
          ? "Session not found or not owned by user. The widget shows an empty state."
          : "No workout sessions found. The widget shows an empty state. Suggest starting a session.",
        { session: null }
      );
    }

    const session = rows[0];
    const isEnded = session.ended_at != null;
    const durationMinutes = isEnded
      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
      : Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);

    // Get program day label
    let programDay: string | undefined;
    if (session.program_day_id) {
      const { rows: dayRows } = await pool.query(
        "SELECT day_label FROM program_days WHERE id = $1",
        [session.program_day_id]
      );
      if (dayRows.length > 0) programDay = dayRows[0].day_label;
    }

    // Get exercises + sets (with logged_at, muscle_group, exercise_type, rep_type)
    const { rows: exerciseDetails } = await pool.query(
      `SELECT e.name, se.superset_group, e.muscle_group, e.exercise_type, e.rep_type,
         COALESCE(json_agg(json_build_object(
           'set_id', st.id, 'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight,
           'rpe', st.rpe, 'set_type', st.set_type, 'logged_at', st.logged_at
         ) ORDER BY st.set_number) FILTER (WHERE st.id IS NOT NULL), '[]') as sets
       FROM session_exercises se
       JOIN exercises e ON e.id = se.exercise_id
       LEFT JOIN sets st ON st.session_exercise_id = se.id
       WHERE se.session_id = $1
       GROUP BY se.id, e.name, se.superset_group, se.sort_order, e.muscle_group, e.exercise_type, e.rep_type
       ORDER BY se.sort_order`,
      [session.id]
    );

    // Previous workout data for each exercise (LATERAL JOIN)
    const { rows: prevRows } = await pool.query(
      `WITH current_exercises AS (
        SELECT DISTINCT se.exercise_id, e.name
        FROM session_exercises se JOIN exercises e ON e.id = se.exercise_id
        WHERE se.session_id = $2
      )
      SELECT ce.name, sub.prev_date, sub.prev_sets
      FROM current_exercises ce
      LEFT JOIN LATERAL (
        SELECT s2.started_at as prev_date,
          json_agg(json_build_object('set_number', st2.set_number, 'reps', st2.reps,
            'weight', st2.weight, 'rpe', st2.rpe, 'set_type', st2.set_type)
          ORDER BY st2.set_number) as prev_sets
        FROM session_exercises se2
        JOIN sessions s2 ON s2.id = se2.session_id
        JOIN sets st2 ON st2.session_exercise_id = se2.id
        WHERE se2.exercise_id = ce.exercise_id AND s2.user_id = $1
          AND s2.id != $2 AND s2.deleted_at IS NULL
        GROUP BY s2.id, s2.started_at
        ORDER BY s2.started_at DESC LIMIT 1
      ) sub ON true`,
      [userId, session.id]
    );
    const prevMap = new Map<string, { date: string; sets: any[] }>();
    for (const row of prevRows) {
      if (row.prev_date && row.prev_sets) {
        prevMap.set(row.name, { date: row.prev_date, sets: row.prev_sets });
      }
    }

    // PR records per exercise
    const { rows: prRows } = await pool.query(
      `SELECT e.name, pr.record_type, pr.value
       FROM personal_records pr
       JOIN exercises e ON e.id = pr.exercise_id
       JOIN session_exercises se ON se.exercise_id = pr.exercise_id AND se.session_id = $2
       WHERE pr.user_id = $1`,
      [userId, session.id]
    );
    const prMap = new Map<string, Record<string, number>>();
    for (const row of prRows) {
      if (!prMap.has(row.name)) prMap.set(row.name, {});
      prMap.get(row.name)![row.record_type] = parseFloat(row.value);
    }

    return widgetResponse(
      `Workout widget displayed. The user can see the full session visually. Do NOT describe, list, or summarize any workout details in text.`,
      {
        session: {
          session_id: session.id,
          started_at: session.started_at,
          ended_at: session.ended_at || null,
          duration_minutes: durationMinutes,
          program_day: programDay,
          tags: session.tags || [],
          exercises: exerciseDetails.map((e: any) => ({
            name: e.name,
            superset_group: e.superset_group,
            muscle_group: e.muscle_group,
            exercise_type: e.exercise_type,
            rep_type: e.rep_type,
            sets: e.sets,
            previous: prevMap.get(e.name) || null,
            prs: prMap.has(e.name) ? prMap.get(e.name) : null,
          })),
        },
        ...(isEnded ? { readonly: true } : {}),
      }
    );
  });
}
