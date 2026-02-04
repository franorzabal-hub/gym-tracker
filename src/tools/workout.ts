import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { getProfile } from "../helpers/profile-helpers.js";

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
  }, safeHandler("show_workout", async ({ session_id }: { session_id?: number }) => {
    const userId = getUserId();

    // Fetch session with program day in one query (saves 1 round-trip)
    let rows;
    if (session_id != null) {
      const result = await pool.query(
        `SELECT s.id, s.started_at, s.ended_at, s.program_day_id, s.tags, s.is_validated, pd.day_label as program_day
         FROM sessions s
         LEFT JOIN program_days pd ON pd.id = s.program_day_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL
         LIMIT 1`,
        [session_id, userId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT s.id, s.started_at, s.ended_at, s.program_day_id, s.tags, s.is_validated, pd.day_label as program_day
         FROM sessions s
         LEFT JOIN program_days pd ON pd.id = s.program_day_id
         WHERE s.user_id = $1 AND s.deleted_at IS NULL
         ORDER BY s.started_at DESC
         LIMIT 1`,
        [userId]
      );
      rows = result.rows;
    }

    // Get user's locale
    const userProfile = await getProfile();
    const locale = (userProfile.language as string) || "en";

    if (rows.length === 0) {
      return widgetResponse(
        session_id != null
          ? "Session not found or not owned by user. The widget shows an empty state."
          : "No workout sessions found. The widget shows an empty state. Suggest starting a session.",
        { session: null, _locale: locale }
      );
    }

    const session = rows[0];
    const isEnded = session.ended_at != null;
    const durationMinutes = isEnded
      ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
      : Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
    const programDay = session.program_day || undefined;

    // Get exercises + sets (with logged_at, muscle_group, exercise_type, rep_type, group info, section info)
    const { rows: exerciseDetails } = await pool.query(
      `SELECT e.id as exercise_id, e.name, se.group_id, seg.group_type, seg.label as group_label, seg.notes as group_notes, seg.rest_seconds as group_rest_seconds,
         se.section_id, ss.label as section_label, ss.notes as section_notes,
         e.muscle_group, e.exercise_type, e.rep_type,
         COALESCE(json_agg(json_build_object(
           'set_id', st.id, 'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight,
           'rpe', st.rpe, 'set_type', st.set_type, 'logged_at', st.logged_at
         ) ORDER BY st.set_number) FILTER (WHERE st.id IS NOT NULL), '[]') as sets
       FROM session_exercises se
       JOIN exercises e ON e.id = se.exercise_id
       LEFT JOIN sets st ON st.session_exercise_id = se.id
       LEFT JOIN session_exercise_groups seg ON seg.id = se.group_id
       LEFT JOIN session_sections ss ON ss.id = se.section_id
       WHERE se.session_id = $1
       GROUP BY se.id, e.id, e.name, se.group_id, seg.group_type, seg.label, seg.notes, seg.rest_seconds, se.section_id, ss.label, ss.notes, se.sort_order, e.muscle_group, e.exercise_type, e.rep_type
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
          AND s2.id != $2 AND s2.deleted_at IS NULL AND s2.ended_at IS NOT NULL
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

    // PR baselines per exercise (values before this session started) for accurate in-session PR badges
    const exerciseIds = Array.from(
      new Set(
        exerciseDetails
          .map((e: any) => Number(e.exercise_id))
          .filter((id: number) => Number.isFinite(id))
      )
    );
    const prBaselineMap = new Map<number, Record<string, number>>();
    if (exerciseIds.length > 0) {
      const { rows: baselineRows } = await pool.query(
        `SELECT DISTINCT ON (exercise_id, record_type) exercise_id, record_type, value
         FROM pr_history
         WHERE user_id = $1
           AND exercise_id = ANY($2)
           AND achieved_at < $3
           AND record_type IN ('max_weight', 'estimated_1rm')
         ORDER BY exercise_id, record_type, achieved_at DESC`,
        [userId, exerciseIds, session.started_at]
      );
      for (const row of baselineRows) {
        const exId = Number(row.exercise_id);
        if (!prBaselineMap.has(exId)) prBaselineMap.set(exId, {});
        prBaselineMap.get(exId)![row.record_type] = Number(row.value);
      }
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
          is_validated: session.is_validated,
          exercises: exerciseDetails.map((e: any) => ({
            name: e.name,
            exercise_id: e.exercise_id,
            group_id: e.group_id,
            group_type: e.group_type,
            group_label: e.group_label,
            group_notes: e.group_notes,
            group_rest_seconds: e.group_rest_seconds,
            section_id: e.section_id,
            section_label: e.section_label,
            section_notes: e.section_notes,
            muscle_group: e.muscle_group,
            exercise_type: e.exercise_type,
            rep_type: e.rep_type,
            sets: e.sets,
            previous: prevMap.get(e.name) || null,
            prs: prMap.has(e.name) ? prMap.get(e.name) : null,
            pr_baseline: prBaselineMap.get(Number(e.exercise_id)) || null,
          })),
        },
        _locale: locale,
        ...(isEnded ? { readonly: true } : {}),
      }
    );
  }));
}
