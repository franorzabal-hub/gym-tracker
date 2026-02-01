import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerWorkoutTool(server: McpServer) {
  registerAppToolWithMeta(server, "show_workout", {
    title: "Active Workout",
    description: `${APP_CONTEXT}Display an interactive workout session widget. Shows the active session with exercises and sets — all editable inline (add/remove exercises, add/remove/edit sets, change reps/weight/RPE).
The widget handles mutations via log_workout and edit_log calls. If no session is active, shows a "no active session" message.
The widget already shows all information visually — do NOT repeat exercises or set details in your response. Just confirm it's displayed or offer next steps.`,
    inputSchema: {},
    annotations: {},
    _meta: { ui: { resourceUri: "ui://gym-tracker/workout.html" } },
  }, async () => {
    const userId = getUserId();

    // Get active session
    const { rows } = await pool.query(
      "SELECT id, started_at, program_day_id, tags FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [userId]
    );

    if (rows.length === 0) {
      return widgetResponse(
        "No active workout session. The widget shows an empty state. Suggest starting a session.",
        { session: null }
      );
    }

    const session = rows[0];
    const durationMinutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);

    // Get program day label
    let programDay: string | undefined;
    if (session.program_day_id) {
      const { rows: dayRows } = await pool.query(
        "SELECT day_label FROM program_days WHERE id = $1",
        [session.program_day_id]
      );
      if (dayRows.length > 0) programDay = dayRows[0].day_label;
    }

    // Get exercises + sets
    const { rows: exerciseDetails } = await pool.query(
      `SELECT e.name, se.superset_group,
         COALESCE(json_agg(json_build_object(
           'set_id', st.id, 'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight, 'rpe', st.rpe, 'set_type', st.set_type
         ) ORDER BY st.set_number) FILTER (WHERE st.id IS NOT NULL), '[]') as sets
       FROM session_exercises se
       JOIN exercises e ON e.id = se.exercise_id
       LEFT JOIN sets st ON st.session_exercise_id = se.id
       WHERE se.session_id = $1
       GROUP BY se.id, e.name, se.superset_group, se.sort_order
       ORDER BY se.sort_order`,
      [session.id]
    );

    // Fetch exercise catalog for autocomplete
    const { rows: exerciseRows } = await pool.query(
      `SELECT name, muscle_group FROM exercises
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY user_id NULLS LAST, name`,
      [userId]
    );

    const exerciseCount = exerciseDetails.length;
    const totalSets = exerciseDetails.reduce((sum: number, e: any) => sum + (Array.isArray(e.sets) ? e.sets.length : 0), 0);

    return widgetResponse(
      `Workout widget displayed showing active session (${durationMinutes} min, ${exerciseCount} exercises, ${totalSets} sets${programDay ? `, ${programDay}` : ""}). The widget supports inline editing — do NOT repeat this information.`,
      {
        session: {
          session_id: session.id,
          started_at: session.started_at,
          duration_minutes: durationMinutes,
          program_day: programDay,
          tags: session.tags || [],
          exercises: exerciseDetails.map((e: any) => ({
            name: e.name,
            superset_group: e.superset_group,
            sets: e.sets,
          })),
        },
        exerciseCatalog: exerciseRows.map((r: any) => ({ name: r.name, muscle_group: r.muscle_group })),
      }
    );
  });
}
