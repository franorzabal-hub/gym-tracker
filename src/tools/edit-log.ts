import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { findExercise } from "../helpers/exercise-resolver.js";

export function registerEditLogTool(server: McpServer) {
  server.tool(
    "edit_log",
    `Edit or delete previously logged sets. Supports single exercise or bulk multi-exercise edits.
Examples:
- "No, eran 80kg" → update weight on the last logged exercise
- "Borrá el último set" → delete specific sets
- "Corregí el press banca de hoy: 4x10 con 70kg" → update all sets of an exercise in today's session
- "Borrá todos los warmup de press banca" → delete sets filtered by type
- "Corregí press banca y sentadilla de hoy" → bulk edit multiple exercises

Parameters:
- exercise: name or alias (required for single mode, ignored if bulk is used)
- session: "today" (default), "last", or a date string
- action: "update" or "delete"
- updates: { reps?, weight?, rpe?, set_type?, notes? } — fields to change
- set_numbers: specific set numbers to edit (if omitted, edits all sets)
- set_ids: specific set IDs to edit directly (alternative to set_numbers)
- set_type_filter: filter sets by type ("warmup", "working", "drop", "failure")
- bulk: array of { exercise, action?, set_numbers?, set_ids?, set_type_filter?, updates? } for multi-exercise edits`,
    {
      exercise: z.string().optional(),
      session: z
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
    },
    async ({ exercise, session, action, updates, set_numbers, set_ids, set_type_filter, bulk }) => {

      // --- Bulk mode ---
      if (bulk && bulk.length > 0) {
        const results = [];
        for (const entry of bulk) {
          const entryAction = entry.action || action || "update";
          const entryUpdates = entry.updates || updates;
          const result = await processSingleEdit({
            exercise: entry.exercise,
            session,
            action: entryAction,
            updates: entryUpdates,
            set_numbers: entry.set_numbers,
            set_ids: entry.set_ids,
            set_type_filter: entry.set_type_filter,
          });
          results.push(result);
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ bulk_results: results }) }],
        };
      }

      // --- Single mode ---
      if (!exercise) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "exercise is required for single mode" }),
            },
          ],
          isError: true,
        };
      }
      if (!action) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "action is required for single mode" }),
            },
          ],
          isError: true,
        };
      }

      const result = await processSingleEdit({
        exercise,
        session,
        action,
        updates,
        set_numbers,
        set_ids,
        set_type_filter,
      });

      if (result.error) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );
}

async function processSingleEdit(params: {
  exercise: string;
  session?: string;
  action: string;
  updates?: { reps?: number; weight?: number; rpe?: number; set_type?: string; notes?: string };
  set_numbers?: number[];
  set_ids?: number[];
  set_type_filter?: string;
}): Promise<Record<string, any>> {
  const { exercise, session, action, updates, set_numbers, set_ids, set_type_filter } = params;

  const resolved = await findExercise(exercise);
  if (!resolved) {
    return { error: `Exercise "${exercise}" not found` };
  }

  // Find the session
  const queryParams: any[] = [resolved.id];
  let sessionFilter: string;
  if (!session || session === "today") {
    sessionFilter = "AND DATE(s.started_at) = CURRENT_DATE";
  } else if (session === "last") {
    sessionFilter = "";
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session)) {
      return { error: "Invalid date format. Use YYYY-MM-DD" };
    }
    queryParams.push(session);
    sessionFilter = `AND DATE(s.started_at) = $${queryParams.length}`;
  }

  // Get ALL session_exercises for that exercise in that session (handles legacy data with multiple entries)
  const { rows: sessionExercises } = await pool.query(
    `SELECT se.id, s.id as session_id, s.started_at
     FROM session_exercises se
     JOIN sessions s ON s.id = se.session_id
     WHERE se.exercise_id = $1 ${sessionFilter}
     ORDER BY s.started_at DESC`,
    queryParams
  );

  if (sessionExercises.length === 0) {
    return { error: `No sets found for ${resolved.name} in the specified session` };
  }

  // Collect all session_exercise IDs (for the most recent session)
  const targetSessionId = sessionExercises[0].session_id;
  const seIds = sessionExercises
    .filter((se: any) => se.session_id === targetSessionId)
    .map((se: any) => se.id);

  if (action === "delete") {
    for (const seId of seIds) {
      const deleteParams: any[] = [seId];
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
  const allUpdatedSets: any[] = [];

  for (const seId of seIds) {
    const setClauses: string[] = [];
    const updateParams: any[] = [seId];

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
