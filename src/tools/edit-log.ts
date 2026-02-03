import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { findExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import type { EditParams, PRCheck, ExerciseType } from "../db/types.js";

// Workout selector type: ID, "today", "last", "yesterday", or YYYY-MM-DD date
type WorkoutSelector = number | "today" | "last" | "yesterday" | string;

/**
 * Resolves a workout selector to a session ID and metadata.
 * Supports: numeric ID, "today", "last", "yesterday", or YYYY-MM-DD date string.
 */
async function resolveWorkoutSelector(
  selector: WorkoutSelector,
  userId: number,
  userDate: string,
  options: { includeDeleted?: boolean } = {}
): Promise<{ session_id: number; started_at: Date; is_validated: boolean; deleted_at: Date | null } | null> {
  const { includeDeleted = false } = options;
  const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

  // Numeric ID - direct lookup
  const numericId = Number(selector);
  if (!Number.isNaN(numericId) && String(selector).match(/^\d+$/)) {
    const { rows } = await pool.query(
      `SELECT id as session_id, started_at, is_validated, deleted_at
       FROM sessions WHERE id = $1 AND user_id = $2 ${deletedFilter}`,
      [numericId, userId]
    );
    return rows[0] || null;
  }

  // Semantic selectors
  let dateFilter: string;
  const params: (number | string)[] = [userId];

  switch (selector) {
    case "today":
      params.push(userDate);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
      break;
    case "yesterday": {
      const yesterday = new Date(userDate);
      yesterday.setDate(yesterday.getDate() - 1);
      params.push(yesterday.toISOString().split("T")[0]);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
      break;
    }
    case "last":
      dateFilter = ""; // No filter, just get most recent
      break;
    default:
      // YYYY-MM-DD date string
      if (typeof selector !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(selector)) {
        return null;
      }
      const parsed = new Date(selector + "T00:00:00Z");
      if (isNaN(parsed.getTime())) {
        return null;
      }
      params.push(selector);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
  }

  const { rows } = await pool.query(
    `SELECT id as session_id, started_at, is_validated, deleted_at
     FROM sessions
     WHERE user_id = $1 ${deletedFilter} ${dateFilter}
     ORDER BY started_at DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

/**
 * Resolves negative set numbers to positive ones.
 * -1 = last set, -2 = second to last, etc.
 */
async function resolveSetNumbers(
  setNumbers: number[],
  seIds: number[]
): Promise<number[]> {
  if (!setNumbers.some((n) => n < 0)) {
    return setNumbers;
  }

  // Get max set number across all session_exercises
  const { rows } = await pool.query(
    `SELECT MAX(set_number) as max_set FROM sets WHERE session_exercise_id = ANY($1)`,
    [seIds]
  );
  const maxSet = rows[0]?.max_set || 0;

  // Resolve negative indices
  return setNumbers.map((n) => (n < 0 ? maxSet + n + 1 : n)).filter((n) => n > 0);
}

export function registerEditLogTool(server: McpServer) {
  server.registerTool("edit_workout", {
    description: `${APP_CONTEXT}Edit or delete previously logged sets, update session metadata, or manage entire workouts.

Examples:
- "No, eran 80kg" → update weight on the last logged exercise
- "Borrá el último set" → delete specific sets (supports negative indices: -1 = last)
- "Corregí el press banca de hoy: 4x10 con 70kg" → update all sets of an exercise
- "Borrá todos los warmup de press banca" → delete sets filtered by type
- "Corregí press banca y sentadilla de hoy" → bulk edit multiple exercises
- "Borrá el workout de hoy" → soft-delete today's workout
- "Validá el workout de ayer" → validate yesterday's workout (recalculates PRs)
- "Agregá una nota al workout" → update session metadata

Parameters:
- exercise: name or alias (required for single mode)
- workout: "today" (default), "last", "yesterday", or YYYY-MM-DD date
- action: "update" or "delete"
- updates: { reps?, weight?, rpe?, set_type?, notes? } — fields to change
- set_numbers: specific set numbers to edit. Supports negative indices: -1 = last set, -2 = second to last
- set_ids: specific set IDs to edit directly (alternative to set_numbers)
- set_type_filter: filter sets by type ("warmup", "working", "drop", "failure")
- bulk: array of { exercise, action?, set_numbers?, set_ids?, set_type_filter?, updates? }
- update_session: { notes?, append_notes?, tags?, add_tags?, remove_tags? } — update session metadata
- delete_workout: workout selector ("today", "last", "yesterday", ID, or date) to soft-delete
- restore_workout: workout ID or date to restore from soft-delete
- delete_workouts: array of workout IDs for bulk soft-delete
- validate_workout: workout selector ("today", "last", "yesterday", ID, or date) to validate`,
    inputSchema: {
      exercise: z.string().optional(),
      workout: z
        .union([z.enum(["today", "last", "yesterday"]), z.string()])
        .optional()
        .default("today"),
      action: z.enum(["update", "delete"]).optional(),
      updates: z
        .object({
          reps: z.number().int().optional(),
          weight: z.number().optional(),
          rpe: z.number().optional(),
          set_type: z.string().optional(),
          notes: z.string().optional(),
        })
        .optional(),
      set_numbers: z.array(z.number().int()).optional().describe("Set numbers to edit. Supports negative indices: -1 = last set"),
      set_ids: z.array(z.number().int()).optional(),
      set_type_filter: z.enum(["warmup", "working", "drop", "failure"]).optional(),
      bulk: z.array(z.object({
        exercise: z.string(),
        action: z.enum(["update", "delete"]).optional(),
        set_numbers: z.array(z.number().int()).optional(),
        set_ids: z.array(z.number().int()).optional(),
        set_type_filter: z.enum(["warmup", "working", "drop", "failure"]).optional(),
        updates: z.object({
          reps: z.number().int().optional(),
          weight: z.number().optional(),
          rpe: z.number().optional(),
          set_type: z.string().optional(),
          notes: z.string().optional(),
        }).optional(),
      })).optional(),
      update_session: z.object({
        notes: z.string().optional().describe("Replace session notes"),
        append_notes: z.string().optional().describe("Append to existing notes"),
        tags: z.array(z.string()).optional().describe("Replace all tags"),
        add_tags: z.array(z.string()).optional().describe("Add tags to existing"),
        remove_tags: z.array(z.string()).optional().describe("Remove specific tags"),
      }).optional().describe("Update session metadata (notes, tags)"),
      delete_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout selector to soft-delete: ID, 'today', 'last', 'yesterday', or YYYY-MM-DD"),
      restore_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout ID or date to restore from soft-delete"),
      delete_workouts: z.union([z.array(z.number().int()), z.string()]).optional().describe("Array of workout IDs for bulk soft-delete"),
      validate_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout selector to validate: ID, 'today', 'last', 'yesterday', or YYYY-MM-DD"),
    },
    annotations: { destructiveHint: true },
  },
    safeHandler("edit_workout", async ({ exercise, workout, action, updates, set_numbers, set_ids, set_type_filter, bulk, update_session, delete_workout, restore_workout, delete_workouts: rawDeleteWorkouts, validate_workout }) => {
      const userId = getUserId();
      const userDate = await getUserCurrentDate();

      // --- Update session metadata mode ---
      if (update_session) {
        const resolved = await resolveWorkoutSelector(workout || "today", userId, userDate);
        if (!resolved) {
          return toolResponse({ error: `No workout found for "${workout || "today"}"` }, true);
        }

        const setClauses: string[] = [];
        const params: (number | string | string[] | null)[] = [resolved.session_id, userId];

        if (update_session.notes !== undefined) {
          params.push(update_session.notes);
          setClauses.push(`notes = $${params.length}`);
        }
        if (update_session.append_notes !== undefined) {
          params.push(update_session.append_notes);
          setClauses.push(`notes = COALESCE(notes || E'\\n' || $${params.length}, $${params.length})`);
        }
        if (update_session.tags !== undefined) {
          params.push(update_session.tags);
          setClauses.push(`tags = $${params.length}`);
        }
        if (update_session.add_tags !== undefined && update_session.add_tags.length > 0) {
          params.push(update_session.add_tags);
          setClauses.push(`tags = array_cat(tags, $${params.length}::text[])`);
        }
        if (update_session.remove_tags !== undefined && update_session.remove_tags.length > 0) {
          params.push(update_session.remove_tags);
          setClauses.push(`tags = array(SELECT unnest(tags) EXCEPT SELECT unnest($${params.length}::text[]))`);
        }

        if (setClauses.length === 0) {
          return toolResponse({ error: "No updates provided in update_session" }, true);
        }

        const { rows } = await pool.query(
          `UPDATE sessions SET ${setClauses.join(", ")}
           WHERE id = $1 AND user_id = $2
           RETURNING id, notes, tags, started_at`,
          params
        );

        return toolResponse({
          updated_session: true,
          session_id: rows[0].id,
          workout_date: rows[0].started_at.toISOString().split("T")[0],
          notes: rows[0].notes,
          tags: rows[0].tags,
        });
      }

      // --- Validate workout mode ---
      if (validate_workout !== undefined && validate_workout !== null) {
        const resolved = await resolveWorkoutSelector(validate_workout, userId, userDate);
        if (!resolved) {
          return toolResponse({ error: `Workout "${validate_workout}" not found` }, true);
        }
        if (resolved.is_validated) {
          return toolResponse({
            message: "Workout is already validated",
            session_id: resolved.session_id,
            workout_date: resolved.started_at.toISOString().split("T")[0],
          });
        }

        // Mark workout as validated
        await pool.query(
          "UPDATE sessions SET is_validated = true WHERE id = $1 AND user_id = $2",
          [resolved.session_id, userId]
        );

        // Recalculate PRs for all exercises in this workout (batch query for all sets)
        const { rows: workoutExercises } = await pool.query(
          `SELECT se.id, se.exercise_id, e.name as exercise_name, e.exercise_type
           FROM session_exercises se
           JOIN exercises e ON e.id = se.exercise_id
           WHERE se.session_id = $1`,
          [resolved.session_id]
        );

        // Batch fetch all sets for all exercises in this workout
        const { rows: allSets } = await pool.query<{ session_exercise_id: number; id: number; reps: number; weight: number | null }>(
          `SELECT s.session_exercise_id, s.id, s.reps, s.weight
           FROM sets s
           JOIN session_exercises se ON se.id = s.session_exercise_id
           WHERE se.session_id = $1`,
          [resolved.session_id]
        );

        // Group sets by session_exercise_id
        const setsByExercise = new Map<number, Array<{ id: number; reps: number; weight: number | null }>>();
        for (const set of allSets) {
          const existing = setsByExercise.get(set.session_exercise_id) || [];
          existing.push({ id: set.id, reps: set.reps, weight: set.weight });
          setsByExercise.set(set.session_exercise_id, existing);
        }

        const allPRs: Array<{ exercise: string; prs: PRCheck[] }> = [];
        for (const se of workoutExercises) {
          const sets = setsByExercise.get(se.id) || [];

          if (sets.length > 0) {
            const prs = await checkPRs(
              se.exercise_id,
              sets.map((s) => ({
                reps: s.reps,
                weight: s.weight ?? null,
                set_id: s.id,
              })),
              se.exercise_type as ExerciseType
            );
            if (prs.length > 0) {
              allPRs.push({ exercise: se.exercise_name, prs });
            }
          }
        }

        return toolResponse({
          validated: true,
          session_id: resolved.session_id,
          workout_date: resolved.started_at.toISOString().split("T")[0],
          exercises_count: workoutExercises.length,
          new_prs: allPRs.length > 0 ? allPRs : undefined,
        });
      }

      // --- Restore workout mode ---
      if (restore_workout !== undefined && restore_workout !== null) {
        const resolved = await resolveWorkoutSelector(restore_workout, userId, userDate, { includeDeleted: true });
        if (!resolved) {
          return toolResponse({ error: `Workout "${restore_workout}" not found` }, true);
        }
        if (!resolved.deleted_at) {
          return toolResponse({ error: `Workout is not deleted`, session_id: resolved.session_id }, true);
        }

        await pool.query("UPDATE sessions SET deleted_at = NULL WHERE id = $1 AND user_id = $2", [resolved.session_id, userId]);

        return toolResponse({
          restored_workout: resolved.session_id,
          workout_date: resolved.started_at.toISOString().split("T")[0],
        });
      }

      // --- Bulk delete workouts mode ---
      if (rawDeleteWorkouts !== undefined && rawDeleteWorkouts !== null) {
        const workoutIds = parseJsonArrayParam<number>(rawDeleteWorkouts);
        if (!workoutIds || !Array.isArray(workoutIds) || workoutIds.length === 0) {
          return toolResponse({ error: "delete_workouts requires an array of workout IDs" }, true);
        }

        const numericIds = workoutIds.map(id => Number(id)).filter(id => !Number.isNaN(id));
        if (numericIds.length === 0) {
          return toolResponse({ error: "No valid workout IDs provided" }, true);
        }

        const { rows } = await pool.query(
          `UPDATE sessions SET deleted_at = NOW()
           WHERE id = ANY($1::int[]) AND user_id = $2 AND deleted_at IS NULL
           RETURNING id, started_at`,
          [numericIds, userId]
        );

        const deleted = rows.map((r: { id: number; started_at: Date }) => ({
          session_id: r.id,
          workout_date: r.started_at.toISOString().split("T")[0],
        }));
        const deletedIds = new Set(rows.map((r: { id: number }) => r.id));
        const not_found = numericIds.filter(id => !deletedIds.has(id));

        return toolResponse({
          deleted,
          not_found: not_found.length > 0 ? not_found : undefined,
        });
      }

      // --- Delete workout mode (soft delete) ---
      if (delete_workout !== undefined && delete_workout !== null) {
        const resolved = await resolveWorkoutSelector(delete_workout, userId, userDate);
        if (!resolved) {
          return toolResponse({ error: `Workout "${delete_workout}" not found` }, true);
        }

        // Get exercise count before deleting
        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int as count FROM session_exercises WHERE session_id = $1`,
          [resolved.session_id]
        );

        await pool.query("UPDATE sessions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2", [resolved.session_id, userId]);

        return toolResponse({
          deleted_workout: resolved.session_id,
          workout_date: resolved.started_at.toISOString().split("T")[0],
          exercises_count: countRows[0].count,
        });
      }

      // --- Bulk mode ---
      if (bulk && bulk.length > 0) {
        const results = [];
        for (const entry of bulk) {
          const entryAction = entry.action || action || "update";
          const entryUpdates = entry.updates || updates;
          const result = await processSingleEdit({
            userId,
            exercise: entry.exercise,
            workout,
            action: entryAction,
            updates: entryUpdates,
            set_numbers: entry.set_numbers,
            set_ids: entry.set_ids,
            set_type_filter: entry.set_type_filter,
            userDate,
          });
          results.push(result);
        }
        return toolResponse({ bulk_results: results });
      }

      // --- Single mode ---
      if (!exercise) {
        return toolResponse({ error: "exercise is required for single mode" }, true);
      }
      if (!action) {
        return toolResponse({ error: "action is required for single mode" }, true);
      }

      const result = await processSingleEdit({
        userId,
        exercise,
        workout,
        action,
        updates,
        set_numbers,
        set_ids,
        set_type_filter,
        userDate,
      });

      if (result.error) {
        return toolResponse(result, true);
      }

      return toolResponse(result);
    })
  );
}

async function processSingleEdit(params: EditParams): Promise<Record<string, unknown>> {
  const { userId, exercise, workout, action, updates, set_ids, set_type_filter, userDate } = params;
  let { set_numbers } = params;

  const resolved = await findExercise(exercise);
  if (!resolved) {
    return { error: `Exercise "${exercise}" not found` };
  }

  // Find the workout
  const queryParams: (number | string)[] = [resolved.id, userId];
  let workoutFilter: string;
  if (!workout || workout === "today") {
    queryParams.push(userDate);
    workoutFilter = `AND s.started_at >= $${queryParams.length}::date AND s.started_at < $${queryParams.length}::date + INTERVAL '1 day'`;
  } else if (workout === "last") {
    workoutFilter = "";
  } else if (workout === "yesterday") {
    const yesterday = new Date(userDate);
    yesterday.setDate(yesterday.getDate() - 1);
    queryParams.push(yesterday.toISOString().split("T")[0]);
    workoutFilter = `AND s.started_at >= $${queryParams.length}::date AND s.started_at < $${queryParams.length}::date + INTERVAL '1 day'`;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workout)) {
      return { error: "Invalid date format. Use YYYY-MM-DD" };
    }
    const parsed = new Date(workout + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) {
      return { error: "Invalid date. Use a valid YYYY-MM-DD date" };
    }
    queryParams.push(workout);
    workoutFilter = `AND s.started_at >= $${queryParams.length}::date AND s.started_at < $${queryParams.length}::date + INTERVAL '1 day'`;
  }

  // Get ALL session_exercises for that exercise in that workout
  const { rows: workoutExercises } = await pool.query(
    `SELECT se.id, s.id as session_id, s.started_at
     FROM session_exercises se
     JOIN sessions s ON s.id = se.session_id
     WHERE se.exercise_id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL ${workoutFilter}
     ORDER BY s.started_at DESC`,
    queryParams
  );

  if (workoutExercises.length === 0) {
    return { error: `No sets found for ${resolved.name} in the specified workout` };
  }

  // Collect all session_exercise IDs (for the most recent workout)
  const targetSessionId = workoutExercises[0].session_id;
  const workoutDate = workoutExercises[0].started_at.toISOString().split("T")[0];
  const seIds = workoutExercises
    .filter((se: { session_id: number }) => se.session_id === targetSessionId)
    .map((se: { id: number }) => se.id);

  // Resolve negative set numbers
  if (set_numbers && set_numbers.length > 0) {
    set_numbers = await resolveSetNumbers(set_numbers, seIds);
    if (set_numbers.length === 0) {
      return { error: "No valid set numbers after resolving negative indices" };
    }
  }

  // Get total sets count for context
  const { rows: totalSetsRows } = await pool.query(
    `SELECT COUNT(*)::int as total FROM sets WHERE session_exercise_id = ANY($1)`,
    [seIds]
  );
  const totalSets = totalSetsRows[0].total;

  if (action === "delete") {
    // Batch DELETE across all seIds in one query
    const deleteParams: (number[] | string)[] = [seIds];
    const conditions: string[] = ["session_exercise_id = ANY($1)"];

    if (set_ids && set_ids.length > 0) {
      deleteParams.push(set_ids);
      conditions.push(`id = ANY($${deleteParams.length})`);
    } else if (set_numbers && set_numbers.length > 0) {
      deleteParams.push(set_numbers);
      conditions.push(`set_number = ANY($${deleteParams.length})`);
    }

    if (set_type_filter) {
      deleteParams.push(set_type_filter);
      conditions.push(`set_type = $${deleteParams.length}`);
    }

    const { rowCount } = await pool.query(
      `DELETE FROM sets WHERE ${conditions.join(" AND ")}`,
      deleteParams
    );
    const deletedCount = rowCount ?? 0;

    // Clean up session_exercises with no remaining sets (batch check)
    if (!set_ids && !set_numbers && !set_type_filter) {
      // If no filter was used, delete all session_exercises
      await pool.query(`DELETE FROM session_exercises WHERE id = ANY($1)`, [seIds]);
    } else {
      // Find and delete session_exercises with no remaining sets
      await pool.query(
        `DELETE FROM session_exercises
         WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM sets WHERE session_exercise_id = session_exercises.id)`,
        [seIds]
      );
    }

    // Get remaining sets for context
    const { rows: remainingSets } = await pool.query(
      `SELECT id as set_id, set_number, reps, weight, rpe, set_type, notes
       FROM sets WHERE session_exercise_id = ANY($1) ORDER BY set_number`,
      [seIds]
    );

    return {
      deleted: true,
      exercise: resolved.name,
      session_id: targetSessionId,
      workout_date: workoutDate,
      sets_deleted: deletedCount,
      sets_remaining: remainingSets.length,
      remaining_sets: remainingSets.length > 0 ? remainingSets : undefined,
      set_numbers: set_numbers || undefined,
      set_ids: set_ids || undefined,
      set_type_filter: set_type_filter || undefined,
      scope: (!set_numbers && !set_ids && !set_type_filter) ? "all" : "filtered",
    };
  }

  // --- Update ---
  if (!updates || Object.keys(updates).length === 0) {
    return { error: "No updates provided" };
  }

  // Batch UPDATE across all seIds in one query
  const setClauses: string[] = [];
  const updateParams: (number[] | number | string | null)[] = [seIds];

  if (updates.reps !== undefined) {
    updateParams.push(updates.reps);
    setClauses.push(`reps = $${updateParams.length}`);
  }
  if (updates.weight !== undefined) {
    updateParams.push(updates.weight);
    setClauses.push(`weight = $${updateParams.length}`);
  }
  if (updates.rpe !== undefined) {
    updateParams.push(updates.rpe);
    setClauses.push(`rpe = $${updateParams.length}`);
  }
  if (updates.set_type !== undefined) {
    updateParams.push(updates.set_type);
    setClauses.push(`set_type = $${updateParams.length}`);
  }
  if (updates.notes !== undefined) {
    updateParams.push(updates.notes);
    setClauses.push(`notes = $${updateParams.length}`);
  }

  let setFilter = "";
  if (set_ids && set_ids.length > 0) {
    updateParams.push(set_ids);
    setFilter = `AND id = ANY($${updateParams.length})`;
  } else if (set_numbers && set_numbers.length > 0) {
    updateParams.push(set_numbers);
    setFilter = `AND set_number = ANY($${updateParams.length})`;
  }

  if (set_type_filter) {
    updateParams.push(set_type_filter);
    setFilter += ` AND set_type = $${updateParams.length}`;
  }

  const { rowCount } = await pool.query(
    `UPDATE sets SET ${setClauses.join(", ")}
     WHERE session_exercise_id = ANY($1) ${setFilter}`,
    updateParams
  );
  const totalUpdated = rowCount ?? 0;

  // Fetch all updated sets in one query
  const { rows: allUpdatedSets } = await pool.query(
    `SELECT id as set_id, set_number, reps, weight, rpe, set_type, notes
     FROM sets WHERE session_exercise_id = ANY($1) ORDER BY set_number`,
    [seIds]
  );

  return {
    exercise: resolved.name,
    session_id: targetSessionId,
    workout_date: workoutDate,
    sets_updated: totalUpdated,
    total_sets: totalSets,
    updated_sets: allUpdatedSets,
  };
}
