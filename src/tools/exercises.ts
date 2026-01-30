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
- "add": Add a new exercise with optional muscle_group, equipment, and aliases
- "update": Update muscle_group and/or equipment of an existing exercise by name
- "delete": Delete an exercise. Use hard_delete=true for permanent removal (cascade deletes aliases, sets NULL on personal_records). Without hard_delete, returns an error (exercises have no soft delete).`,
    {
      action: z.enum(["list", "add", "search", "update", "delete"]),
      name: z.string().optional(),
      muscle_group: z.string().optional(),
      equipment: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      hard_delete: z.boolean().optional(),
    },
    async ({ action, name, muscle_group, equipment, aliases, hard_delete }) => {
      if (action === "list" || action === "search") {
        const exercises = await searchExercises(
          action === "search" ? name : undefined,
          muscle_group
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ exercises }) },
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
        if (updates.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide muscle_group and/or equipment to update" }) }],
            isError: true,
          };
        }
        params.push(name);
        const { rows } = await pool.query(
          `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length}) RETURNING id, name, muscle_group, equipment`,
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
        if (!hard_delete) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Exercises can only be hard-deleted. Set hard_delete=true to permanently remove this exercise." }) }],
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

      // add
      if (!name) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
          isError: true,
        };
      }

      const resolved = await resolveExercise(name, muscle_group, equipment);

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
