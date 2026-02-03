import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerSessionTools(server: McpServer) {
  server.registerTool(
    "end_workout",
    {
      description: `${APP_CONTEXT}End the current active workout. Returns a summary with duration, exercises count, total sets, total volume, and comparison vs last time.
Optionally add or update tags on the workout.`,
      inputSchema: {
        notes: z.string().optional(),
        force: z.boolean().optional().default(false),
        tags: z.union([z.array(z.string()), z.string()]).optional().describe("Tags to set on this workout (replaces existing tags)"),
        summary_only: z.boolean().optional().describe("If true, return only summary totals without per-exercise set details"),
        include_comparison: z.boolean().optional().describe("If true, include comparison with previous workout. Defaults to true"),
      },
      annotations: {},
      _meta: {
        "openai/toolInvocation/invoking": "Ending workout...",
        "openai/toolInvocation/invoked": "Workout ended",
      },
    },
    safeHandler("end_workout", async ({ notes, force, tags: rawTags, summary_only, include_comparison }) => {
      const tags = parseJsonArrayParam<string>(rawTags);
      const userId = getUserId();

      const active = await pool.query(
        "SELECT id, started_at FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
        [userId]
      );
      if (active.rows.length === 0) {
        return toolResponse({ error: "No active workout" }, true);
      }

      const sessionId = active.rows[0].id;

      // Check if workout has any exercises with actual sets logged
      const { rows: [exerciseCheck] } = await pool.query(
        `SELECT
           COUNT(DISTINCT se.id) as exercise_count,
           COUNT(st.id) as set_count
         FROM session_exercises se
         LEFT JOIN sets st ON st.session_exercise_id = se.id
         WHERE se.session_id = $1`,
        [sessionId]
      );

      const exerciseCount = Number(exerciseCheck.exercise_count);
      const setCount = Number(exerciseCheck.set_count);

      if (exerciseCount === 0 && !force) {
        return toolResponse({
          warning: "Workout has no exercises logged. Pass force: true to close anyway, or log exercises first.",
          workout_id: sessionId,
          started_at: active.rows[0].started_at,
        });
      }

      if (exerciseCount > 0 && setCount === 0 && !force) {
        return toolResponse({
          warning: `Workout has ${exerciseCount} planned exercise(s) but no sets logged. Log sets with log_workout or pass force: true to close anyway.`,
          workout_id: sessionId,
          started_at: active.rows[0].started_at,
        });
      }

      // If workout was backdated, set ended_at relative to started_at instead of NOW()
      const sessionStarted = new Date(active.rows[0].started_at);
      const isBackdated = (Date.now() - sessionStarted.getTime()) > 24 * 60 * 60 * 1000;
      const endedAt = isBackdated
        ? new Date(sessionStarted.getTime() + 60 * 60 * 1000)
        : new Date();

      await pool.query(
        `UPDATE sessions SET ended_at = $2, notes = COALESCE($3, notes)${tags ? ', tags = $4' : ''}
         WHERE id = $1 AND user_id = $${tags ? 5 : 4}`,
        tags ? [sessionId, endedAt, notes || null, tags, userId] : [sessionId, endedAt, notes || null, userId]
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

      // If summary_only, return minimal response without exercise details or comparison
      if (summary_only) {
        // Get new PRs achieved during this workout
        const { rows: newPrs } = await pool.query(
          `SELECT e.name as exercise, ph.record_type, ph.value
           FROM pr_history ph
           JOIN exercises e ON e.id = ph.exercise_id
           JOIN sets st ON st.id = ph.set_id
           JOIN session_exercises se ON se.id = st.session_exercise_id
           WHERE se.session_id = $1 AND ph.user_id = $2`,
          [sessionId, userId]
        );

        const summaryData = {
          workout_id: sessionId,
          duration_minutes: Math.round(summary.duration_minutes),
          exercises_count: Number(summary.exercises_count),
          total_sets: Number(summary.total_sets),
          total_volume_kg: Math.round(Number(summary.total_volume_kg)),
          new_prs: newPrs.map((pr: any) => ({ exercise: pr.exercise, record_type: pr.record_type, value: pr.value })),
        };
        return toolResponse(summaryData);
      }

      // Get exercises grouped by exercise groups
      const { rows: exerciseDetails } = await pool.query(
        `SELECT e.name, se.group_id, seg.group_type, seg.label as group_label,
           se.section_id, ss.label as section_label, ss.notes as section_notes,
           COALESCE(json_agg(json_build_object(
             'set_id', st.id, 'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight, 'rpe', st.rpe, 'set_type', st.set_type
           ) ORDER BY st.set_number) FILTER (WHERE st.id IS NOT NULL), '[]') as sets
         FROM session_exercises se
         JOIN exercises e ON e.id = se.exercise_id
         LEFT JOIN sets st ON st.session_exercise_id = se.id
         LEFT JOIN session_exercise_groups seg ON seg.id = se.group_id
         LEFT JOIN session_sections ss ON ss.id = se.section_id
         WHERE se.session_id = $1
         GROUP BY se.id, e.name, se.group_id, seg.group_type, seg.label, se.section_id, ss.label, ss.notes, se.sort_order
         ORDER BY se.sort_order`,
        [sessionId]
      );

      // Group exercises by group_id for display
      const groups: Record<number, { type: string; label: string | null; exercises: string[] }> = {};
      for (const ex of exerciseDetails) {
        if (ex.group_id != null) {
          if (!groups[ex.group_id]) groups[ex.group_id] = { type: ex.group_type, label: ex.group_label, exercises: [] };
          groups[ex.group_id].exercises.push(ex.name);
        }
      }

      // Workout comparison - find previous workout with same program_day
      let comparison: any = undefined;
      if (include_comparison !== false) {
        const { rows: [currentSession] } = await pool.query(
          'SELECT program_day_id FROM sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]
        );

        if (currentSession?.program_day_id) {
          const { rows: prevSessions } = await pool.query(
            `SELECT s.id, s.started_at FROM sessions s
             WHERE s.user_id = $1 AND s.program_day_id = $2 AND s.id != $3 AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
             ORDER BY s.started_at DESC LIMIT 1`,
            [userId, currentSession.program_day_id, sessionId]
          );

          if (prevSessions.length > 0) {
            const prevId = prevSessions[0].id;

            // Get previous workout volume
            const { rows: [prevSummary] } = await pool.query(
              `SELECT COALESCE(SUM(CASE WHEN st.set_type != 'warmup' THEN st.weight * st.reps ELSE 0 END), 0) as volume
               FROM session_exercises se
               JOIN sets st ON st.session_exercise_id = se.id
               WHERE se.session_id = $1`,
              [prevId]
            );

            const currentVolume = Number(summary.total_volume_kg);
            const prevVolume = Number(prevSummary.volume);
            const volumeChange = prevVolume > 0 ? Math.round(((currentVolume - prevVolume) / prevVolume) * 100) : null;

            // Per-exercise comparison
            const { rows: prevExercises } = await pool.query(
              `SELECT e.name,
                 MAX(CASE WHEN st.set_type != 'warmup' THEN st.weight ELSE NULL END) as max_weight,
                 COUNT(st.id) as total_sets
               FROM session_exercises se
               JOIN exercises e ON e.id = se.exercise_id
               JOIN sets st ON st.session_exercise_id = se.id
               WHERE se.session_id = $1
               GROUP BY e.name`,
              [prevId]
            );

            const prevMap = new Map(prevExercises.map((e: any) => [e.name, e]));
            const exerciseChanges: any[] = [];

            for (const ex of exerciseDetails) {
              const prev = prevMap.get(ex.name);
              if (prev && ex.sets) {
                const currentMax = Math.max(...ex.sets.filter((s: any) => s.set_type !== 'warmup').map((s: any) => s.weight || 0));
                const prevMax = Number(prev.max_weight) || 0;
                if (currentMax !== prevMax && prevMax > 0) {
                  const diff = currentMax - prevMax;
                  exerciseChanges.push({
                    exercise: ex.name,
                    change: `${diff > 0 ? '+' : ''}${diff}kg on max weight`,
                  });
                }
              }
            }

            comparison = {
              vs_last: prevSessions[0].started_at,
              volume_change: volumeChange !== null ? `${volumeChange > 0 ? '+' : ''}${volumeChange}%` : null,
              exercise_changes: exerciseChanges.length > 0 ? exerciseChanges : undefined,
            };
          }
        }
      }

      const endData = {
        workout_id: sessionId,
        duration_minutes: Math.round(summary.duration_minutes),
        exercises_count: Number(summary.exercises_count),
        total_sets: Number(summary.total_sets),
        total_volume_kg: Math.round(Number(summary.total_volume_kg)),
        exercises: exerciseDetails.map((e: any) => ({ name: e.name, group_id: e.group_id, group_type: e.group_type, group_label: e.group_label, section_id: e.section_id, section_label: e.section_label, section_notes: e.section_notes, sets: e.sets })),
        groups: Object.keys(groups).length > 0 ? groups : undefined,
        comparison: comparison || undefined,
      };
      return toolResponse(endData);
    })
  );
}
