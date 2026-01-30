import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";

export function registerEditLogTool(server: McpServer) {
  server.tool(
    "edit_log",
    `Edit or delete previously logged sets. Use this when the user wants to correct a mistake.
Examples:
- "No, eran 80kg" → update weight on the last logged exercise
- "Borrá el último set" → delete specific sets
- "Corregí el press banca de hoy: 4x10 con 70kg" → update all sets of an exercise in today's session

Parameters:
- exercise: name or alias
- session: "today" (default), "last", or a date string
- action: "update" or "delete"
- updates: { reps?, weight?, rpe?, set_type? } — fields to change
- set_numbers: specific set numbers to edit (if omitted, edits all sets)`,
    {
      exercise: z.string(),
      session: z
        .union([z.enum(["today", "last"]), z.string()])
        .optional()
        .default("today"),
      action: z.enum(["update", "delete"]),
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
    },
    async ({ exercise, session, action, updates, set_numbers }) => {
      const resolved = await resolveExercise(exercise);

      // Find the session
      let sessionFilter: string;
      if (session === "today") {
        sessionFilter = "AND DATE(s.started_at) = CURRENT_DATE";
      } else if (session === "last") {
        sessionFilter = "";
      } else {
        sessionFilter = `AND DATE(s.started_at) = '${session}'`;
      }

      const { rows: sessionExercises } = await pool.query(
        `SELECT se.id, s.id as session_id, s.started_at
         FROM session_exercises se
         JOIN sessions s ON s.id = se.session_id
         WHERE se.exercise_id = $1 ${sessionFilter}
         ORDER BY s.started_at DESC
         LIMIT 1`,
        [resolved.id]
      );

      if (sessionExercises.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `No sets found for ${resolved.name} in the specified session`,
              }),
            },
          ],
          isError: true,
        };
      }

      const seId = sessionExercises[0].id;

      if (action === "delete") {
        if (set_numbers && set_numbers.length > 0) {
          await pool.query(
            `DELETE FROM sets WHERE session_exercise_id = $1 AND set_number = ANY($2)`,
            [seId, set_numbers]
          );
        } else {
          await pool.query(
            `DELETE FROM sets WHERE session_exercise_id = $1`,
            [seId]
          );
          // Also delete the session_exercise if all sets removed
          await pool.query(
            `DELETE FROM session_exercises WHERE id = $1`,
            [seId]
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                deleted: true,
                exercise: resolved.name,
                set_numbers: set_numbers || "all",
              }),
            },
          ],
        };
      }

      // update
      if (!updates || Object.keys(updates).length === 0) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "No updates provided" }) },
          ],
          isError: true,
        };
      }

      const setClauses: string[] = [];
      const params: any[] = [seId];

      if (updates.reps !== undefined) {
        params.push(updates.reps);
        setClauses.push(`reps = $${params.length}`);
      }
      if (updates.weight !== undefined) {
        params.push(updates.weight);
        setClauses.push(`weight = $${params.length}`);
      }
      if (updates.rpe !== undefined) {
        params.push(updates.rpe);
        setClauses.push(`rpe = $${params.length}`);
      }
      if (updates.set_type !== undefined) {
        params.push(updates.set_type);
        setClauses.push(`set_type = $${params.length}`);
      }
      if (updates.notes !== undefined) {
        params.push(updates.notes);
        setClauses.push(`notes = $${params.length}`);
      }

      let setFilter = "";
      if (set_numbers && set_numbers.length > 0) {
        params.push(set_numbers);
        setFilter = `AND set_number = ANY($${params.length})`;
      }

      const { rowCount } = await pool.query(
        `UPDATE sets SET ${setClauses.join(", ")}
         WHERE session_exercise_id = $1 ${setFilter}`,
        params
      );

      // Fetch updated sets
      const { rows: updatedSets } = await pool.query(
        `SELECT set_number, reps, weight, rpe, set_type
         FROM sets WHERE session_exercise_id = $1 ORDER BY set_number`,
        [seId]
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              exercise: resolved.name,
              sets_updated: rowCount,
              updated_sets: updatedSets,
            }),
          },
        ],
      };
    }
  );
}
