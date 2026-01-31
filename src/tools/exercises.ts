import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise, searchExercises } from "../helpers/exercise-resolver.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam, parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, widgetResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

export function registerExercisesTool(server: McpServer) {
  registerAppToolWithMeta(server,
    "manage_exercises",
    {
      title: "Manage Exercises",
      description: `Use this when you need to manage the exercise library. Actions:
- "list": List all exercises, optionally filtered by muscle_group. Supports pagination with limit/offset. Returns { exercises, total }.
- "search": Search exercises by name/alias (fuzzy)
- "add": Add a new exercise with optional muscle_group, equipment, aliases, rep_type, exercise_type
- "add_bulk": Add multiple exercises at once. Pass an "exercises" array with {name, muscle_group?, equipment?, aliases?, rep_type?, exercise_type?}. Returns created/existing/failed counts.
- "update": Update muscle_group, equipment, rep_type, and/or exercise_type of an existing exercise by name. Only user-owned exercises can be updated.
- "delete": Permanently delete an exercise (cascade deletes aliases, sets NULL on personal_records). Only user-owned exercises can be deleted. The LLM should confirm with the user before calling.
- "delete_bulk": Delete multiple exercises at once. Pass "names" array (string[]). Only user-owned exercises can be deleted. Returns { deleted, not_found, failed }. The LLM should confirm with the user before calling.
- "update_bulk": Update multiple exercises at once. Pass "exercises" array with [{name, muscle_group?, equipment?, rep_type?, exercise_type?}]. Only user-owned exercises can be updated. Returns { updated, not_found, failed }.
- "list_aliases": List all aliases for a given exercise (pass name)
- "add_alias": Add a new alias to an existing exercise (pass name + alias)
- "remove_alias": Remove an alias from an exercise (pass name + alias)
- "merge": Merge two exercises: move all session data from source to target, then delete source. Pass source + target names.

rep_type: "reps" (default), "seconds", "meters", "calories" - how the exercise is measured
exercise_type: "strength" (default), "mobility", "cardio", "warmup" - category of exercise (PRs only tracked for strength)

IMPORTANT: Results are displayed in an interactive widget. Do not repeat the data in your response — just confirm the action or add brief context.`,
      inputSchema: {
        action: z.enum(["list", "add", "search", "update", "delete", "add_bulk", "delete_bulk", "update_bulk", "list_aliases", "add_alias", "remove_alias", "merge"]),
        name: z.string().optional(),
        muscle_group: z.string().optional(),
        equipment: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
        exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),
        names: z.union([z.array(z.string()), z.string()]).optional().describe("Array of exercise names for delete_bulk"),
        exercises: z.union([
          z.array(z.object({
            name: z.string(),
            muscle_group: z.string().optional(),
            equipment: z.string().optional(),
            aliases: z.array(z.string()).optional(),
            rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
            exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),
          })),
          z.string(),
        ]).optional(),
        limit: z.number().int().optional().describe("Max exercises to return. Defaults to 100"),
        offset: z.number().int().optional().describe("Skip first N exercises for pagination. Defaults to 0"),
        alias: z.string().optional().describe("Alias name for add_alias/remove_alias actions"),
        source: z.string().optional().describe("Source exercise name for merge action"),
        target: z.string().optional().describe("Target exercise name for merge action"),
      },
      annotations: {},
      _meta: {
        ui: { resourceUri: "ui://gym-tracker/exercises.html" },
      },
    },
    async ({ action, name, muscle_group, equipment, aliases, rep_type, exercise_type, names: rawNames, exercises, limit, offset, alias, source, target }) => {
      const userId = getUserId();

      if (action === "search") {
        const results = await searchExercises(name, muscle_group);
        return widgetResponse(`Found ${results.length} exercise(s).`, { exercises: results });
      }

      if (action === "list") {
        const effectiveLimit = limit ?? 100;
        const effectiveOffset = offset ?? 0;

        // Build conditions
        const params: any[] = [userId];
        const conditions: string[] = ["(e.user_id IS NULL OR e.user_id = $1)"];

        if (muscle_group) {
          params.push(muscle_group.toLowerCase());
          conditions.push(`LOWER(e.muscle_group) = $${params.length}`);
        }

        const whereClause = " WHERE " + conditions.join(" AND ");

        // Get total count
        const countResult = await pool.query(
          `SELECT COUNT(DISTINCT e.id) as total FROM exercises e${whereClause}`,
          params
        );
        const total = Number(countResult.rows[0].total);

        // Get paginated results
        params.push(effectiveLimit);
        const limitIdx = params.length;
        params.push(effectiveOffset);
        const offsetIdx = params.length;

        const { rows: results } = await pool.query(
          `SELECT e.id, e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type,
            COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}') as aliases
          FROM exercises e
          LEFT JOIN exercise_aliases a ON a.exercise_id = e.id
          ${whereClause}
          GROUP BY e.id ORDER BY e.user_id NULLS LAST, e.name
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params
        );

        return widgetResponse(`${total} exercise(s)${muscle_group ? ` in ${muscle_group}` : ""}.`, { exercises: results, total });
      }

      if (action === "update") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }
        const updates: string[] = [];
        const params: any[] = [];
        if (muscle_group) {
          params.push(muscle_group);
          updates.push(`muscle_group = $${params.length}`);
        }
        if (equipment) {
          params.push(equipment);
          updates.push(`equipment = $${params.length}`);
        }
        if (rep_type) {
          params.push(rep_type);
          updates.push(`rep_type = $${params.length}`);
        }
        if (exercise_type) {
          params.push(exercise_type);
          updates.push(`exercise_type = $${params.length}`);
        }
        if (updates.length === 0) {
          return toolResponse({ error: "Provide at least one field to update (muscle_group, equipment, rep_type, exercise_type)" }, true);
        }

        // Check if exercise is global (use separate params to avoid unreferenced $N)
        const checkGlobal = await pool.query(
          `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
          [name, userId]
        );
        if (checkGlobal.rows.length === 0) {
          return toolResponse({ error: `Exercise "${name}" not found` }, true);
        }
        if (checkGlobal.rows[0].user_id === null) {
          return toolResponse({ error: "Exercise is global and cannot be modified" }, true);
        }

        // Update only user-owned
        params.push(name);
        params.push(userId);
        const { rows } = await pool.query(
          `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length - 1}) AND user_id = $${params.length} RETURNING id, name, muscle_group, equipment, rep_type, exercise_type`,
          params
        );
        if (rows.length === 0) {
          return toolResponse({ error: `Exercise "${name}" not found` }, true);
        }
        return widgetResponse(`Exercise "${rows[0].name}" updated.`, { updated: rows[0] });
      }

      if (action === "delete") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }

        // Check if exercise is global
        const checkGlobal = await pool.query(
          `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
          [name, userId]
        );
        if (checkGlobal.rows.length === 0) {
          return toolResponse({ error: `Exercise "${name}" not found` }, true);
        }
        if (checkGlobal.rows[0].user_id === null) {
          return toolResponse({ error: "Exercise is global and cannot be deleted" }, true);
        }

        // Check for references in session_exercises
        const refs = await pool.query(
          `SELECT COUNT(*) as count FROM session_exercises se
           JOIN exercises e ON e.id = se.exercise_id
           WHERE LOWER(e.name) = LOWER($1) AND e.user_id = $2`,
          [name, userId]
        );
        const refCount = Number(refs.rows[0].count);

        const { rows } = await pool.query(
          `DELETE FROM exercises WHERE LOWER(name) = LOWER($1) AND user_id = $2 RETURNING id, name`,
          [name, userId]
        );
        if (rows.length === 0) {
          return toolResponse({ error: `Exercise "${name}" not found` }, true);
        }
        return widgetResponse(
          `Exercise "${rows[0].name}" deleted.${refCount > 0 ? ` Was referenced in ${refCount} session log(s).` : ""}`,
          { deleted: rows[0], warning: refCount > 0 ? `Referenced in ${refCount} session log(s). Aliases cascade-deleted.` : undefined }
        );
      }

      if (action === "delete_bulk") {
        const namesList = parseJsonArrayParam<string>(rawNames);
        if (!namesList || !Array.isArray(namesList) || namesList.length === 0) {
          return toolResponse({ error: "names array required for delete_bulk" }, true);
        }

        const deleted: string[] = [];
        const not_found: string[] = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const n of namesList) {
          try {
            // Check if global
            const check = await pool.query(
              `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
              [n, userId]
            );
            if (check.rows.length === 0) {
              not_found.push(n);
              continue;
            }
            if (check.rows[0].user_id === null) {
              failed.push({ name: n, error: "Exercise is global and cannot be deleted" });
              continue;
            }

            const { rows } = await pool.query(
              "DELETE FROM exercises WHERE LOWER(name) = LOWER($1) AND user_id = $2 RETURNING name",
              [n, userId]
            );
            if (rows.length === 0) {
              not_found.push(n);
            } else {
              deleted.push(rows[0].name);
            }
          } catch (err: any) {
            failed.push({ name: n, error: err.message || "Unknown error" });
          }
        }

        return widgetResponse(
          `Deleted ${deleted.length} exercise(s).${not_found.length > 0 ? ` ${not_found.length} not found.` : ""}`,
          { deleted, not_found: not_found.length > 0 ? not_found : undefined, failed: failed.length > 0 ? failed : undefined }
        );
      }

      if (action === "update_bulk") {
        const exercisesList = parseJsonParam<any[]>(exercises);
        if (!exercisesList || !Array.isArray(exercisesList) || exercisesList.length === 0) {
          return toolResponse({ error: "exercises array required for update_bulk" }, true);
        }

        const updated: string[] = [];
        const not_found: string[] = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const ex of exercisesList) {
          try {
            const updates: string[] = [];
            const params: any[] = [];
            if (ex.muscle_group) { params.push(ex.muscle_group); updates.push(`muscle_group = $${params.length}`); }
            if (ex.equipment) { params.push(ex.equipment); updates.push(`equipment = $${params.length}`); }
            if (ex.rep_type) { params.push(ex.rep_type); updates.push(`rep_type = $${params.length}`); }
            if (ex.exercise_type) { params.push(ex.exercise_type); updates.push(`exercise_type = $${params.length}`); }

            if (updates.length === 0) {
              failed.push({ name: ex.name, error: "No fields to update" });
              continue;
            }

            // Check if global
            const check = await pool.query(
              `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
              [ex.name, userId]
            );
            if (check.rows.length === 0) {
              not_found.push(ex.name);
              continue;
            }
            if (check.rows[0].user_id === null) {
              failed.push({ name: ex.name, error: "Exercise is global and cannot be modified" });
              continue;
            }

            params.push(ex.name);
            params.push(userId);
            const { rows } = await pool.query(
              `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length - 1}) AND user_id = $${params.length} RETURNING name`,
              params
            );
            if (rows.length === 0) {
              not_found.push(ex.name);
            } else {
              updated.push(rows[0].name);
            }
          } catch (err: any) {
            failed.push({ name: ex.name, error: err.message || "Unknown error" });
          }
        }

        return widgetResponse(
          `Updated ${updated.length} exercise(s).${not_found.length > 0 ? ` ${not_found.length} not found.` : ""}`,
          { updated, not_found: not_found.length > 0 ? not_found : undefined, failed: failed.length > 0 ? failed : undefined }
        );
      }

      if (action === "add_bulk") {
        // Some MCP clients serialize nested arrays as JSON strings
        const exercisesList = parseJsonParam<any[]>(exercises);
        if (!exercisesList || !Array.isArray(exercisesList) || exercisesList.length === 0) {
          return toolResponse({ error: "exercises array required for add_bulk" }, true);
        }

        const created: string[] = [];
        const existing: string[] = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const ex of exercisesList) {
          try {
            const resolved = await resolveExercise(
              ex.name,
              ex.muscle_group,
              ex.equipment,
              ex.rep_type,
              ex.exercise_type
            );

            if (resolved.isNew) {
              created.push(resolved.name);
            } else {
              existing.push(resolved.name);
            }

            // Insert aliases if provided
            if (ex.aliases && ex.aliases.length > 0) {
              for (const alias of ex.aliases) {
                await pool
                  .query(
                    "INSERT INTO exercise_aliases (exercise_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    [resolved.id, alias.toLowerCase().trim()]
                  )
                  .catch(() => {});
              }
            }
          } catch (err: any) {
            failed.push({ name: ex.name, error: err.message || "Unknown error" });
          }
        }

        return widgetResponse(
          `Added ${created.length} exercise(s), ${existing.length} already existed.`,
          { created, existing, failed: failed.length > 0 ? failed : undefined, total: exercisesList.length }
        );
      }

      if (action === "list_aliases") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }
        const { rows } = await pool.query(
          `SELECT ea.alias FROM exercise_aliases ea
           JOIN exercises e ON ea.exercise_id = e.id
           WHERE LOWER(e.name) = LOWER($1) AND (e.user_id IS NULL OR e.user_id = $2)`,
          [name, userId]
        );
        return widgetResponse(`Aliases for "${name}".`, { exercise: name, aliases: rows.map((r: any) => r.alias) });
      }

      if (action === "add_alias") {
        if (!name || !alias) {
          return toolResponse({ error: "Name and alias required" }, true);
        }
        try {
          const { rowCount } = await pool.query(
            `INSERT INTO exercise_aliases (exercise_id, alias)
             SELECT id, $2 FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $3)
             ORDER BY user_id NULLS LAST LIMIT 1`,
            [name, alias.toLowerCase().trim(), userId]
          );
          if (!rowCount || rowCount === 0) {
            return toolResponse({ error: `Exercise "${name}" not found` }, true);
          }
          return widgetResponse(`Alias "${alias}" added to "${name}".`, { added_alias: alias.toLowerCase().trim(), exercise: name });
        } catch (err: any) {
          if (err.code === "23505") {
            return toolResponse({ error: `Alias "${alias}" already exists` }, true);
          }
          throw err;
        }
      }

      if (action === "remove_alias") {
        if (!name || !alias) {
          return toolResponse({ error: "Name and alias required" }, true);
        }
        const { rowCount } = await pool.query(
          `DELETE FROM exercise_aliases ea
           USING exercises e
           WHERE ea.exercise_id = e.id AND LOWER(e.name) = LOWER($1) AND LOWER(ea.alias) = LOWER($2)
             AND (e.user_id IS NULL OR e.user_id = $3)`,
          [name, alias, userId]
        );
        if (!rowCount || rowCount === 0) {
          return toolResponse({ error: `Alias "${alias}" not found for exercise "${name}"` }, true);
        }
        return widgetResponse(`Alias "${alias}" removed from "${name}".`, { removed_alias: alias, exercise: name });
      }

      if (action === "merge") {
        if (!source || !target) {
          return toolResponse({ error: "Source and target exercise names required" }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Find source exercise
          const sourceResult = await client.query(
            `SELECT id, name, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
            [source, userId]
          );
          if (sourceResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return toolResponse({ error: `Source exercise "${source}" not found` }, true);
          }
          const sourceEx = sourceResult.rows[0];

          if (sourceEx.user_id === null) {
            await client.query("ROLLBACK");
            return toolResponse({ error: "Cannot merge a global exercise as source. Only user-owned exercises can be merged." }, true);
          }

          // Find target exercise
          const targetResult = await client.query(
            `SELECT id, name FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
            [target, userId]
          );
          if (targetResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return toolResponse({ error: `Target exercise "${target}" not found` }, true);
          }
          const targetEx = targetResult.rows[0];

          if (sourceEx.id === targetEx.id) {
            await client.query("ROLLBACK");
            return toolResponse({ error: "Source and target are the same exercise" }, true);
          }

          // 1. Move session_exercises (only for sessions owned by this user)
          const seResult = await client.query(
            `UPDATE session_exercises SET exercise_id = $1 WHERE exercise_id = $2 AND session_id IN (SELECT id FROM sessions WHERE user_id = $3)`,
            [targetEx.id, sourceEx.id, userId]
          );
          const sessionExercisesMoved = seResult.rowCount || 0;

          // 2. Handle personal_records conflicts: keep higher value
          // First, delete source records where target already has a higher or equal value for the same record_type
          await client.query(
            `DELETE FROM personal_records pr_source
             WHERE pr_source.exercise_id = $1 AND pr_source.user_id = $2
               AND EXISTS (
                 SELECT 1 FROM personal_records pr_target
                 WHERE pr_target.exercise_id = $3 AND pr_target.user_id = $2
                   AND pr_target.record_type = pr_source.record_type
                   AND pr_target.value >= pr_source.value
               )`,
            [sourceEx.id, userId, targetEx.id]
          );
          // Then, for source records with higher value, delete the target record and reassign source
          await client.query(
            `DELETE FROM personal_records pr_target
             WHERE pr_target.exercise_id = $1 AND pr_target.user_id = $2
               AND EXISTS (
                 SELECT 1 FROM personal_records pr_source
                 WHERE pr_source.exercise_id = $3 AND pr_source.user_id = $2
                   AND pr_source.record_type = pr_target.record_type
                   AND pr_source.value > pr_target.value
               )`,
            [targetEx.id, userId, sourceEx.id]
          );
          // Now move remaining source records to target (no conflicts left)
          const prResult = await client.query(
            `UPDATE personal_records SET exercise_id = $1 WHERE exercise_id = $2 AND user_id = $3`,
            [targetEx.id, sourceEx.id, userId]
          );
          const prMoved = prResult.rowCount || 0;

          // 3. Move pr_history
          const phResult = await client.query(
            `UPDATE pr_history SET exercise_id = $1 WHERE exercise_id = $2 AND user_id = $3`,
            [targetEx.id, sourceEx.id, userId]
          );
          const prHistoryMoved = phResult.rowCount || 0;

          // 4. Move aliases from source to target (skip duplicates)
          await client.query(
            `UPDATE exercise_aliases SET exercise_id = $1
             WHERE exercise_id = $2
               AND LOWER(alias) NOT IN (
                 SELECT LOWER(alias) FROM exercise_aliases WHERE exercise_id = $1
               )`,
            [targetEx.id, sourceEx.id]
          );
          // Delete any remaining aliases on source (duplicates that couldn't be moved)
          await client.query(
            `DELETE FROM exercise_aliases WHERE exercise_id = $1`,
            [sourceEx.id]
          );

          // 5. Delete source exercise
          await client.query(
            `DELETE FROM exercises WHERE id = $1`,
            [sourceEx.id]
          );

          await client.query("COMMIT");

          return widgetResponse(
            `Merged "${sourceEx.name}" into "${targetEx.name}". ${sessionExercisesMoved} session entries moved.`,
            { merged: { source: sourceEx.name, target: targetEx.name, session_exercises_moved: sessionExercisesMoved, personal_records_moved: prMoved, pr_history_moved: prHistoryMoved } }
          );
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      // add
      if (!name) {
        return toolResponse({ error: "Name required" }, true);
      }

      const resolved = await resolveExercise(name, muscle_group, equipment, rep_type, exercise_type);

      if (aliases && aliases.length > 0) {
        for (const alias of aliases) {
          await pool
            .query(
              "INSERT INTO exercise_aliases (exercise_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING",
              [resolved.id, alias.toLowerCase().trim()]
            )
            .catch(() => {}); // ignore duplicate alias
        }
      }

      return widgetResponse(
        resolved.isNew ? `Exercise "${resolved.name}" created.` : `Exercise "${resolved.name}" already exists.`,
        { exercise: { id: resolved.id, name: resolved.name }, is_new: resolved.isNew }
      );
    }
  );
}
