import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise, searchExercises } from "../helpers/exercise-resolver.js";

export function registerExercisesTool(server: McpServer) {
  server.tool(
    "manage_exercises",
    `Manage the exercise library. Actions:
- "list": List all exercises, optionally filtered by muscle_group
- "search": Search exercises by name/alias (fuzzy)
- "add": Add a new exercise with optional muscle_group, equipment, aliases, rep_type, exercise_type
- "add_bulk": Add multiple exercises at once. Pass an "exercises" array with {name, muscle_group?, equipment?, aliases?, rep_type?, exercise_type?}. Returns created/existing/failed counts.
- "update": Update muscle_group, equipment, rep_type, and/or exercise_type of an existing exercise by name
- "delete": Permanently delete an exercise (cascade deletes aliases, sets NULL on personal_records). The LLM should confirm with the user before calling.
- "delete_bulk": Delete multiple exercises at once. Pass "names" array (string[]). Returns { deleted, not_found, failed }. The LLM should confirm with the user before calling.
- "update_bulk": Update multiple exercises at once. Pass "exercises" array with [{name, muscle_group?, equipment?, rep_type?, exercise_type?}]. Returns { updated, not_found, failed }.

rep_type: "reps" (default), "seconds", "meters", "calories" - how the exercise is measured
exercise_type: "strength" (default), "mobility", "cardio", "warmup" - category of exercise (PRs only tracked for strength)`,
    {
      action: z.enum(["list", "add", "search", "update", "delete", "add_bulk", "delete_bulk", "update_bulk"]),
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
    },
    async ({ action, name, muscle_group, equipment, aliases, rep_type, exercise_type, names: rawNames, exercises }) => {
      if (action === "list" || action === "search") {
        const results = await searchExercises(
          action === "search" ? name : undefined,
          muscle_group
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ exercises: results }) },
          ],
        };
      }

      if (action === "update") {
        if (!name) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
            isError: true,
          };
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
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide at least one field to update (muscle_group, equipment, rep_type, exercise_type)" }) }],
            isError: true,
          };
        }
        params.push(name);
        const { rows } = await pool.query(
          `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length}) RETURNING id, name, muscle_group, equipment, rep_type, exercise_type`,
          params
        );
        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Exercise "${name}" not found` }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ updated: rows[0] }) }],
        };
      }

      if (action === "delete") {
        if (!name) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
            isError: true,
          };
        }
        // Check for references in session_exercises
        const refs = await pool.query(
          `SELECT COUNT(*) as count FROM session_exercises se
           JOIN exercises e ON e.id = se.exercise_id
           WHERE LOWER(e.name) = LOWER($1)`,
          [name]
        );
        const refCount = Number(refs.rows[0].count);

        const { rows } = await pool.query(
          `DELETE FROM exercises WHERE LOWER(name) = LOWER($1) RETURNING id, name`,
          [name]
        );
        if (rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Exercise "${name}" not found` }) }],
            isError: true,
          };
        }
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              deleted: rows[0],
              warning: refCount > 0
                ? `This exercise was referenced in ${refCount} session log(s). Aliases were cascade-deleted and personal_records set to NULL.`
                : "Exercise and aliases permanently deleted.",
            }),
          }],
        };
      }

      if (action === "delete_bulk") {
        let namesList = rawNames as any;
        if (typeof namesList === 'string') {
          try { namesList = JSON.parse(namesList); } catch { namesList = null; }
        }
        if (!namesList || !Array.isArray(namesList) || namesList.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "names array required for delete_bulk" }) }],
            isError: true,
          };
        }

        const deleted: string[] = [];
        const not_found: string[] = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const n of namesList) {
          try {
            const { rows } = await pool.query(
              "DELETE FROM exercises WHERE LOWER(name) = LOWER($1) RETURNING name",
              [n]
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

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              deleted,
              not_found: not_found.length > 0 ? not_found : undefined,
              failed: failed.length > 0 ? failed : undefined,
            }),
          }],
        };
      }

      if (action === "update_bulk") {
        let exercisesList = exercises as any;
        if (typeof exercisesList === 'string') {
          try { exercisesList = JSON.parse(exercisesList); } catch { exercisesList = null; }
        }
        if (!exercisesList || !Array.isArray(exercisesList) || exercisesList.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "exercises array required for update_bulk" }) }],
            isError: true,
          };
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

            params.push(ex.name);
            const { rows } = await pool.query(
              `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length}) RETURNING name`,
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

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              updated,
              not_found: not_found.length > 0 ? not_found : undefined,
              failed: failed.length > 0 ? failed : undefined,
            }),
          }],
        };
      }

      if (action === "add_bulk") {
        // Some MCP clients serialize nested arrays as JSON strings
        let exercisesList = exercises as any;
        if (typeof exercisesList === 'string') {
          try { exercisesList = JSON.parse(exercisesList); } catch { exercisesList = null; }
        }
        if (!exercisesList || !Array.isArray(exercisesList) || exercisesList.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "exercises array required for add_bulk" }) }],
            isError: true,
          };
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

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              created,
              existing,
              failed: failed.length > 0 ? failed : undefined,
              total: exercisesList.length,
            }),
          }],
        };
      }

      // add
      if (!name) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
          isError: true,
        };
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

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              exercise: { id: resolved.id, name: resolved.name },
              is_new: resolved.isNew,
            }),
          },
        ],
      };
    }
  );
}
