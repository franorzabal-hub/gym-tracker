import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { findExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import type { EditParams, PRCheck, SetRow, ExerciseType } from "../db/types.js";

export function registerEditLogTool(server: McpServer) {
  server.registerTool("edit_workout", {
    description: `${APP_CONTEXT}Edit or delete previously logged sets, or delete entire workouts.

Examples:
- "No, eran 80kg" → update weight on the last logged exercise
- "Borrá el último set" → delete specific sets
- "Corregí el press banca de hoy: 4x10 con 70kg" → update all sets of an exercise in today's workout
- "Borrá todos los warmup de press banca" → delete sets filtered by type
- "Corregí press banca y sentadilla de hoy" → bulk edit multiple exercises
- "Borrá el workout 42" → soft-delete an entire workout
- "Restaurá el workout 42" → restore a soft-deleted workout
- "Validá el workout 42" → validate a pending workout (recalculates PRs)

Parameters:
- exercise: name or alias (required for single mode, ignored if bulk or delete_workout is used)
- workout: "today" (default), "last", or a date string
- action: "update" or "delete"
- updates: { reps?, weight?, rpe?, set_type?, notes? } — fields to change
- set_numbers: specific set numbers to edit (if omitted, edits all sets)
- set_ids: specific set IDs to edit directly (alternative to set_numbers)
- set_type_filter: filter sets by type ("warmup", "working", "drop", "failure")
- bulk: array of { exercise, action?, set_numbers?, set_ids?, set_type_filter?, updates? } for multi-exercise edits
- delete_workout: workout ID to soft-delete (sets deleted_at timestamp, can be restored)
- restore_workout: workout ID to restore (clears deleted_at timestamp)
- delete_workouts: array of workout IDs for bulk soft-delete. Returns { deleted, not_found }.
- validate_workout: workout ID to validate. Marks as validated and recalculates PRs.`,
    inputSchema: {
      exercise: z.string().optional(),
      workout: z
        .union([z.enum(["today", "last"]), z.string()])
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
      set_numbers: z.array(z.number().int()).optional(),
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
      delete_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout ID to soft-delete. Sets deleted_at timestamp; can be restored later."),
      restore_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout ID to restore from soft-delete. Clears the deleted_at timestamp."),
      delete_workouts: z.union([z.array(z.number().int()), z.string()]).optional().describe("Array of workout IDs for bulk soft-delete."),
      validate_workout: z.union([z.number().int(), z.string()]).optional().describe("Workout ID to validate. Marks as validated and recalculates PRs."),
    },
    annotations: { destructiveHint: true },
  },
    safeHandler("edit_workout", async ({ exercise, workout, action, updates, set_numbers, set_ids, set_type_filter, bulk, delete_workout, restore_workout, delete_workouts: rawDeleteWorkouts, validate_workout }) => {
      const userId = getUserId();

      // --- Validate workout mode ---
      if (validate_workout !== undefined && validate_workout !== null) {
        const workoutId = Number(validate_workout);
        if (Number.isNaN(workoutId)) {
          return toolResponse({ error: "Invalid workout ID" }, true);
        }

        // Get workout and verify ownership
        const { rows: workoutRows } = await pool.query(
          "SELECT id, started_at, is_validated FROM sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
          [workoutId, userId]
        );
        if (workoutRows.length === 0) {
          return toolResponse({ error: `Workout ${validate_workout} not found` }, true);
        }
        if (workoutRows[0].is_validated) {
          return toolResponse({ message: "Workout is already validated", workout_id: workoutId });
        }

        // Mark workout as validated
        await pool.query(
          "UPDATE sessions SET is_validated = true WHERE id = $1 AND user_id = $2",
          [workoutId, userId]
        );

        // Recalculate PRs for all exercises in this workout
        const { rows: workoutExercises } = await pool.query(
          `SELECT se.id, se.exercise_id, e.name as exercise_name, e.exercise_type
           FROM session_exercises se
           JOIN exercises e ON e.id = se.exercise_id
           WHERE se.session_id = $1`,
          [workoutId]
        );

        const allPRs: Array<{ exercise: string; prs: PRCheck[] }> = [];
        for (const se of workoutExercises) {
          // Get all sets for this workout exercise
          const { rows: sets } = await pool.query<{ id: number; reps: number; weight: number | null }>(
            `SELECT id, reps, weight FROM sets WHERE session_exercise_id = $1`,
            [se.id]
          );

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
          workout_id: workoutId,
          started_at: workoutRows[0].started_at,
          new_prs: allPRs.length > 0 ? allPRs : undefined,
        });
      }

      // --- Restore workout mode ---
      if (restore_workout !== undefined && restore_workout !== null) {
        const workoutId = Number(restore_workout);
        if (Number.isNaN(workoutId)) {
          return toolResponse({ error: "Invalid workout ID" }, true);
        }
        const { rows: workoutRows } = await pool.query(
          "SELECT id, started_at, deleted_at FROM sessions WHERE id = $1 AND user_id = $2",
          [workoutId, userId]
        );
        if (workoutRows.length === 0) {
          return toolResponse({ error: `Workout ${restore_workout} not found` }, true);
        }
        if (!workoutRows[0].deleted_at) {
          return toolResponse({ error: `Workout ${restore_workout} is not deleted` }, true);
        }
        await pool.query("UPDATE sessions SET deleted_at = NULL WHERE id = $1 AND user_id = $2", [workoutId, userId]);
        return toolResponse({
          restored_workout: workoutId,
          started_at: workoutRows[0].started_at,
        });
      }

      // --- Bulk delete workouts mode ---
      if (rawDeleteWorkouts !== undefined && rawDeleteWorkouts !== null) {
        const workoutIds = parseJsonArrayParam<number>(rawDeleteWorkouts);
        if (!workoutIds || !Array.isArray(workoutIds) || workoutIds.length === 0) {
          return toolResponse({ error: "delete_workouts requires an array of workout IDs" }, true);
        }

        // Convert to numbers and filter invalid
        const numericIds = workoutIds.map(id => Number(id)).filter(id => !Number.isNaN(id));
        if (numericIds.length === 0) {
          return toolResponse({ error: "No valid workout IDs provided" }, true);
        }

        // Single batch query for better performance
        const { rows } = await pool.query(
          `UPDATE sessions SET deleted_at = NOW()
           WHERE id = ANY($1::int[]) AND user_id = $2 AND deleted_at IS NULL
           RETURNING id`,
          [numericIds, userId]
        );

        const deleted = rows.map((r: { id: number }) => r.id);
        const deletedSet = new Set(deleted);
        const not_found = numericIds.filter(id => !deletedSet.has(id));

        return toolResponse({
          deleted,
          not_found: not_found.length > 0 ? not_found : undefined,
        });
      }

      // --- Delete workout mode (soft delete) ---
      if (delete_workout !== undefined && delete_workout !== null) {
        const workoutId = Number(delete_workout);
        if (Number.isNaN(workoutId)) {
          return toolResponse({ error: "Invalid workout ID" }, true);
        }
        // Verify ownership
        const { rows: workoutRows } = await pool.query(
          "SELECT id, started_at, ended_at FROM sessions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
          [workoutId, userId]
        );
        if (workoutRows.length === 0) {
          return toolResponse({ error: `Workout ${delete_workout} not found` }, true);
        }

        await pool.query("UPDATE sessions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2", [workoutId, userId]);

        return toolResponse({
          deleted_workout: workoutId,
          started_at: workoutRows[0].started_at,
        });
      }

      // --- Bulk mode ---
      if (bulk && bulk.length > 0) {
        const userDate = await getUserCurrentDate();
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

      const userDate = await getUserCurrentDate();
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
  const { userId, exercise, workout, action, updates, set_numbers, set_ids, set_type_filter, userDate } = params;

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

  // Get ALL session_exercises for that exercise in that workout (handles legacy data with multiple entries)
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
  const seIds = workoutExercises
    .filter((se: { session_id: number }) => se.session_id === targetSessionId)
    .map((se: { id: number }) => se.id);

  if (action === "delete") {
    for (const seId of seIds) {
      const deleteParams: (number | number[] | string)[] = [seId];
      const conditions: string[] = ["session_exercise_id = $1"];

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

      await pool.query(
        `DELETE FROM sets WHERE ${conditions.join(" AND ")}`,
        deleteParams
      );

      // If no specific filter was used (deleting all), also delete the session_exercise
      if (!set_ids && !set_numbers && !set_type_filter) {
        await pool.query(`DELETE FROM session_exercises WHERE id = $1`, [seId]);
      } else {
        // Check if any sets remain; if not, clean up the session_exercise
        const { rows: remainingRows } = await pool.query(
          `SELECT 1 FROM sets WHERE session_exercise_id = $1 LIMIT 1`,
          [seId]
        );
        if (remainingRows.length === 0) {
          await pool.query(`DELETE FROM session_exercises WHERE id = $1`, [seId]);
        }
      }
    }

    return {
      deleted: true,
      exercise: resolved.name,
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

  let totalUpdated = 0;
  const allUpdatedSets: Array<{
    set_id: number;
    set_number: number;
    reps: number;
    weight: number | null;
    rpe: number | null;
    set_type: string;
    notes: string | null;
  }> = [];

  for (const seId of seIds) {
    const setClauses: string[] = [];
    const updateParams: (number | number[] | string | null)[] = [seId];

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
       WHERE session_exercise_id = $1 ${setFilter}`,
      updateParams
    );
    totalUpdated += rowCount ?? 0;

    // Fetch updated sets
    const { rows: updatedSets } = await pool.query(
      `SELECT id as set_id, set_number, reps, weight, rpe, set_type, notes
       FROM sets WHERE session_exercise_id = $1 ORDER BY set_number`,
      [seId]
    );
    allUpdatedSets.push(...updatedSets);
  }

  return {
    exercise: resolved.name,
    sets_updated: totalUpdated,
    updated_sets: allUpdatedSets,
  };
}
