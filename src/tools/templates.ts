import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerTemplatesTool(server: McpServer) {
  server.registerTool("manage_templates", {
    description: `${APP_CONTEXT}Manage session templates — save a workout as a reusable template, list templates, or start a new session from one.

Actions:
- "save": Save a completed session as a template. Pass session_id (or "last" for the most recent ended session) and a name.
- "list": List all saved templates with their exercises.
- "start": Start a new session pre-populated from a template. Pass template name. Exercises are logged as session_exercises (no sets yet — use log_workout to fill them in).
- "delete": Delete a template by name.
- "delete_bulk": Delete multiple templates at once. Pass "names" array. Returns { deleted, not_found }.`,
    inputSchema: {
        action: z.enum(["save", "list", "start", "delete", "delete_bulk"]),
        name: z.string().optional(),
        session_id: z.union([z.number().int(), z.literal("last")]).optional(),
        date: z.string().optional().describe("ISO date (e.g. '2025-01-28') to backdate the session when using 'start'. Defaults to now."),
        names: z.union([z.array(z.string()), z.string()]).optional().describe("Array of template names for delete_bulk"),
        limit: z.number().int().optional().describe("Max templates to return. Defaults to 50"),
        offset: z.number().int().optional().describe("Skip first N templates for pagination. Defaults to 0"),
      },
    annotations: { destructiveHint: true },
  },
    async ({ action, name, session_id, date, names: rawNames, limit, offset }) => {
      const userId = getUserId();

      if (action === "list") {
        const effectiveLimit = limit ?? 50;
        const effectiveOffset = offset ?? 0;

        // Get total count
        const countResult = await pool.query(
          `SELECT COUNT(*) as total FROM session_templates WHERE user_id = $1`,
          [userId]
        );
        const total = Number(countResult.rows[0].total);

        const { rows: templates } = await pool.query(
          `SELECT st.id, st.name, st.created_at,
             COALESCE(json_agg(
               json_build_object(
                 'exercise', e.name,
                 'target_sets', ste.target_sets,
                 'target_reps', ste.target_reps,
                 'target_weight', ste.target_weight,
                 'target_rpe', ste.target_rpe,
                 'superset_group', ste.superset_group,
                 'rest_seconds', ste.rest_seconds
               ) ORDER BY ste.sort_order
             ) FILTER (WHERE ste.id IS NOT NULL), '[]') as exercises
           FROM session_templates st
           LEFT JOIN session_template_exercises ste ON ste.template_id = st.id
           LEFT JOIN exercises e ON e.id = ste.exercise_id
           WHERE st.user_id = $1
           GROUP BY st.id
           ORDER BY st.name
           LIMIT $2 OFFSET $3`,
          [userId, effectiveLimit, effectiveOffset]
        );
        return toolResponse({ templates, total });
      }

      if (action === "save") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }

        // Resolve session_id
        let sid: number;
        if (session_id === "last" || session_id === undefined) {
          const { rows } = await pool.query(
            "SELECT id FROM sessions WHERE user_id = $1 AND ended_at IS NOT NULL AND deleted_at IS NULL ORDER BY ended_at DESC LIMIT 1",
            [userId]
          );
          if (rows.length === 0) {
            return toolResponse({ error: "No completed sessions found" }, true);
          }
          sid = rows[0].id;
        } else {
          sid = session_id;
        }

        // Get session exercises with their best set data
        const { rows: sessionExercises } = await pool.query(
          `SELECT se.exercise_id, se.sort_order, se.superset_group, se.rest_seconds, se.notes,
             COUNT(st.id) as set_count,
             MODE() WITHIN GROUP (ORDER BY st.reps) as common_reps,
             MAX(st.weight) as max_weight,
             MAX(st.rpe) as max_rpe
           FROM session_exercises se
           JOIN sessions s ON s.id = se.session_id
           LEFT JOIN sets st ON st.session_exercise_id = se.id
           WHERE se.session_id = $1 AND s.user_id = $2
           GROUP BY se.id
           ORDER BY se.sort_order`,
          [sid, userId]
        );

        if (sessionExercises.length === 0) {
          return toolResponse({ error: "Session has no exercises" }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const { rows: [tmpl] } = await client.query(
            `INSERT INTO session_templates (user_id, name, source_session_id) VALUES ($1, $2, $3) RETURNING id`,
            [userId, name, sid]
          );

          for (const se of sessionExercises) {
            await client.query(
              `INSERT INTO session_template_exercises
                 (template_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                tmpl.id,
                se.exercise_id,
                Number(se.set_count) || null,
                se.common_reps || null,
                se.max_weight || null,
                se.max_rpe || null,
                se.sort_order,
                se.superset_group || null,
                se.rest_seconds || null,
                se.notes || null,
              ]
            );
          }

          await client.query("COMMIT");

          return toolResponse({
            template: { id: tmpl.id, name },
            exercises_count: sessionExercises.length,
            source_session_id: sid,
          });
        } catch (err: any) {
          await client.query("ROLLBACK");
          if (err.code === "23505") {
            return toolResponse({ error: `Template "${name}" already exists` }, true);
          }
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "start") {
        if (!name) {
          return toolResponse({ error: "Template name required" }, true);
        }

        // Check no active session
        const active = await pool.query(
          "SELECT id FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL LIMIT 1",
          [userId]
        );
        if (active.rows.length > 0) {
          return toolResponse({ error: "There is already an active session", session_id: active.rows[0].id }, true);
        }

        // Find template
        const { rows: templates } = await pool.query(
          "SELECT id FROM session_templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, name]
        );
        if (templates.length === 0) {
          return toolResponse({ error: `Template "${name}" not found` }, true);
        }

        // Get template exercises
        const { rows: templateExercises } = await pool.query(
          `SELECT ste.*, e.name as exercise_name
           FROM session_template_exercises ste
           JOIN exercises e ON e.id = ste.exercise_id
           WHERE ste.template_id = $1
           ORDER BY ste.sort_order`,
          [templates[0].id]
        );

        // Create session + pre-populate in a transaction
        const startClient = await pool.connect();
        try {
          await startClient.query("BEGIN");

          const startedAt = date ? new Date(date + 'T00:00:00') : new Date();
          const { rows: [session] } = await startClient.query(
            "INSERT INTO sessions (user_id, started_at) VALUES ($1, $2) RETURNING id, started_at",
            [userId, startedAt]
          );

          // Pre-populate session_exercises
          for (const te of templateExercises) {
            await startClient.query(
              `INSERT INTO session_exercises (session_id, exercise_id, sort_order, superset_group, rest_seconds, notes)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [session.id, te.exercise_id, te.sort_order, te.superset_group || null, te.rest_seconds || null, te.notes || null]
            );
          }

          await startClient.query("COMMIT");

          return toolResponse({
            session_id: session.id,
            started_at: session.started_at,
            template: name,
            planned_exercises: templateExercises.map((te: any) => ({
              exercise: te.exercise_name,
              target_sets: te.target_sets,
              target_reps: te.target_reps,
              target_weight: te.target_weight,
              target_rpe: te.target_rpe,
              rest_seconds: te.rest_seconds,
              superset_group: te.superset_group,
            })),
          });
        } catch (err) {
          await startClient.query("ROLLBACK");
          throw err;
        } finally {
          startClient.release();
        }
      }

      if (action === "delete") {
        if (!name) {
          return toolResponse({ error: "Template name required" }, true);
        }
        const { rows } = await pool.query(
          "DELETE FROM session_templates WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
          [userId, name]
        );
        if (rows.length === 0) {
          return toolResponse({ error: `Template "${name}" not found` }, true);
        }
        return toolResponse({ deleted: rows[0].name });
      }

      if (action === "delete_bulk") {
        const namesList = parseJsonArrayParam<string>(rawNames);
        if (!namesList || !Array.isArray(namesList) || namesList.length === 0) {
          return toolResponse({ error: "names array required for delete_bulk" }, true);
        }

        const deleted: string[] = [];
        const not_found: string[] = [];

        for (const n of namesList) {
          const { rows } = await pool.query(
            "DELETE FROM session_templates WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
            [userId, n]
          );
          if (rows.length === 0) {
            not_found.push(n);
          } else {
            deleted.push(rows[0].name);
          }
        }

        return toolResponse({
          deleted,
          not_found: not_found.length > 0 ? not_found : undefined,
        });
      }

      return toolResponse({ error: "Unknown action" }, true);
    }
  );
}
