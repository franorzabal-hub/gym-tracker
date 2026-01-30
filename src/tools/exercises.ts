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
- "add": Add a new exercise with optional muscle_group, equipment, and aliases`,
    {
      action: z.enum(["list", "add", "search"]),
      name: z.string().optional(),
      muscle_group: z.string().optional(),
      equipment: z.string().optional(),
      aliases: z.array(z.string()).optional(),
    },
    async ({ action, name, muscle_group, equipment, aliases }) => {
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
