import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import {
  getActiveProgram,
  getLatestVersion,
  getProgramDaysWithExercises,
  cloneVersion,
} from "../helpers/program-helpers.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam, parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, widgetResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

const dayExerciseSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1).default(3),
  reps: z.number().int().min(1).default(10),
  weight: z.number().optional(),
  rpe: z.number().min(1).max(10).optional(),
  superset_group: z.number().int().optional(),
  rest_seconds: z.number().int().optional(),
  notes: z.string().optional(),
});

const daySchema = z.object({
  day_label: z.string(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  exercises: z.array(dayExerciseSchema),
});

export function registerProgramTool(server: McpServer) {
  registerAppToolWithMeta(server, "manage_program", {
    title: "Manage Program",
    description: `Manage workout programs (routines). A program is a weekly routine like PPL, Upper/Lower, Full Body.
Each program has versioned days with exercises. When updated, a new version is created preserving history.

Actions:
- "list": List all programs with their current version and active status
- "get": Get the current version of a program by name, with all days and exercises
- "create": Create a new program with days and exercises (auto-activates it)
- "update": Modify a program. If "days" array is provided, creates a new version with updated days + change_description. If only metadata (new_name, description) is provided without days, updates the program metadata without creating a new version.
- "activate": Set a program as the active one (deactivates all others). Only one program can be active.
- "delete": Deactivate a program (soft delete). Use hard_delete=true to permanently remove with all versions/days/exercises (irreversible).
- "delete_bulk": Delete multiple programs at once. Pass "names" array. Optional hard_delete=true for permanent removal. Returns { deleted, not_found }.
- "history": List all versions of a program with dates and change descriptions

For "create" and "update" with days, pass the "days" array with day_label, weekdays (ISO: 1=Mon..7=Sun), and exercises.
For "update" with days, also pass change_description explaining what changed.
For "update" metadata only, pass new_name and/or description (no days needed).
For "activate", pass the program name.

IMPORTANT: Results are displayed in an interactive widget. Do not repeat the data in your response — just confirm the action or add brief context.`,
    inputSchema: {
      action: z.enum(["list", "get", "create", "update", "activate", "delete", "delete_bulk", "history"]),
      name: z.string().optional(),
      new_name: z.string().optional().describe("New name for the program (update metadata only)"),
      description: z.string().optional(),
      days: z.union([z.array(daySchema), z.string()]).optional(),
      change_description: z.string().optional(),
      hard_delete: z.boolean().optional(),
      names: z.union([z.array(z.string()), z.string()]).optional().describe("Array of program names for delete_bulk"),
      include_exercises: z.boolean().optional().describe("If true, include exercise details for each day. Defaults to true"),
    },
    annotations: { readOnlyHint: false },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/programs.html" },
    },
  }, async ({ action, name, new_name, description, days: rawDays, change_description, hard_delete, names: rawNames, include_exercises }) => {
      const userId = getUserId();

      // Some MCP clients serialize nested arrays as JSON strings
      const days = parseJsonParam<any[]>(rawDays);

      if (action === "list") {
        const { rows } = await pool.query(
          `SELECT p.id, p.name, p.description, p.is_active,
             (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id) as current_version,
             (SELECT COUNT(*) FROM program_days pd
              JOIN program_versions pv ON pv.id = pd.version_id
              WHERE pv.program_id = p.id AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
             ) as days_count
           FROM programs p WHERE p.user_id = $1 ORDER BY p.is_active DESC, p.name`,
          [userId]
        );
        const active = rows.find((r) => r.is_active);
        return widgetResponse(
          `${rows.length} program(s).${active ? ` Active: ${active.name}.` : ""}`,
          { active_program: active ? active.name : null, programs: rows }
        );
      }

      if (action === "get") {
        const program = name
          ? await pool
              .query(
                `SELECT p.id, p.name, p.description, pv.id as version_id, pv.version_number
               FROM programs p JOIN program_versions pv ON pv.program_id = p.id
               WHERE p.user_id = $1 AND LOWER(p.name) = LOWER($2)
               ORDER BY pv.version_number DESC LIMIT 1`,
                [userId, name]
              )
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return toolResponse({ error: "Program not found" }, true);
        }

        const shouldIncludeExercises = include_exercises !== false;

        if (shouldIncludeExercises) {
          const days = await getProgramDaysWithExercises(program.version_id);
          return widgetResponse(
            `Program: ${program.name} (v${program.version_number}).`,
            {
              program: {
                name: program.name,
                description: program.description,
                version: program.version_number,
                days,
              },
            }
          );
        } else {
          // Return days without exercises
          const { rows: days } = await pool.query(
            `SELECT pd.id, pd.day_label, pd.weekdays, pd.sort_order
             FROM program_days pd
             WHERE pd.version_id = $1
             ORDER BY pd.sort_order`,
            [program.version_id]
          );
          return widgetResponse(
            `Program: ${program.name} (v${program.version_number}).`,
            {
              program: {
                name: program.name,
                description: program.description,
                version: program.version_number,
              },
              days,
            }
          );
        }
      }

      if (action === "create") {
        if (!name || !days || days.length === 0) {
          return toolResponse({ error: "Name and days are required" }, true);
        }

        // Check if program name already exists for this user
        const existing = await pool.query(
          "SELECT id FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, name]
        );
        if (existing.rows.length > 0) {
          return toolResponse({
                  error: `Program "${name}" already exists. Use action "update" to modify it, or "delete" first to recreate.`,
                }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Deactivate other programs for this user
          await client.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);

          const {
            rows: [prog],
          } = await client.query(
            `INSERT INTO programs (user_id, name, description, is_active) VALUES ($1, $2, $3, TRUE)
             RETURNING id`,
            [userId, name, description || null]
          );

          const {
            rows: [ver],
          } = await client.query(
            `INSERT INTO program_versions (program_id, version_number, change_description)
             VALUES ($1, 1, 'Initial version') RETURNING id`,
            [prog.id]
          );

          const createdExercises = new Set<string>();
          const existingExercises = new Set<string>();

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              const resolved = await resolveExercise(ex.exercise, undefined, undefined, undefined, undefined, client);

              if (resolved.isNew) {
                createdExercises.add(resolved.name);
              } else {
                existingExercises.add(resolved.name);
              }

              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  newDay.id,
                  resolved.id,
                  ex.sets,
                  ex.reps,
                  ex.weight || null,
                  ex.rpe || null,
                  j,
                  ex.superset_group || null,
                  ex.rest_seconds || null,
                  ex.notes || null,
                ]
              );
            }
          }

          await client.query("COMMIT");

          return widgetResponse(
            `Program '${name}' created with ${days.length} days.`,
            {
              program: { id: prog.id, name, version: 1 },
              days_created: days.length,
              exercises_summary: {
                created: Array.from(createdExercises),
                existing: Array.from(existingExercises),
                total: createdExercises.size + existingExercises.size,
              },
            }
          );
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "update") {
        // Find program
        const program = name
          ? await pool
              .query("SELECT id FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)", [
                userId, name,
              ])
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return toolResponse({ error: "Program not found" }, true);
        }

        // Metadata-only update (no days = no new version)
        if (!days || days.length === 0) {
          const updates: string[] = [];
          const params: any[] = [];
          if (new_name) {
            params.push(new_name);
            updates.push(`name = $${params.length}`);
          }
          if (description !== undefined) {
            params.push(description || null);
            updates.push(`description = $${params.length}`);
          }
          if (updates.length === 0) {
            return toolResponse({ error: "Provide days array for versioned update, or new_name/description for metadata update" }, true);
          }
          params.push(program.id);
          params.push(userId);
          const { rows } = await pool.query(
            `UPDATE programs SET ${updates.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING id, name, description`,
            params
          );
          return widgetResponse("Program metadata updated.", { updated: rows[0] });
        }

        const latestVersion = await getLatestVersion(program.id);
        if (!latestVersion) {
          return toolResponse({ error: "No version found" }, true);
        }

        const newVersionNumber = latestVersion.version_number + 1;
        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const {
            rows: [ver],
          } = await client.query(
            `INSERT INTO program_versions (program_id, version_number, change_description)
             VALUES ($1, $2, $3) RETURNING id`,
            [program.id, newVersionNumber, change_description || null]
          );

          const createdExercises = new Set<string>();
          const existingExercises = new Set<string>();

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              const resolved = await resolveExercise(ex.exercise, undefined, undefined, undefined, undefined, client);

              if (resolved.isNew) {
                createdExercises.add(resolved.name);
              } else {
                existingExercises.add(resolved.name);
              }

              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  newDay.id,
                  resolved.id,
                  ex.sets,
                  ex.reps,
                  ex.weight || null,
                  ex.rpe || null,
                  j,
                  ex.superset_group || null,
                  ex.rest_seconds || null,
                  ex.notes || null,
                ]
              );
            }
          }

          await client.query("COMMIT");

          return widgetResponse(
            `Program '${name || program.name}' updated to v${newVersionNumber}.`,
            {
              program: { name: name || program.name, version: newVersionNumber },
              change_description,
              exercises_summary: {
                created: Array.from(createdExercises),
                existing: Array.from(existingExercises),
                total: createdExercises.size + existingExercises.size,
              },
            }
          );
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "activate") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }
        const prog = await pool.query(
          "SELECT id, name FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, name]
        );
        if (prog.rows.length === 0) {
          return toolResponse({ error: `Program "${name}" not found` }, true);
        }
        await pool.query("UPDATE programs SET is_active = (id = $2) WHERE user_id = $1", [userId, prog.rows[0].id]);
        return widgetResponse(
          `'${prog.rows[0].name}' is now the active program.`,
          { activated: prog.rows[0].name }
        );
      }

      if (action === "delete") {
        if (!name) {
          return toolResponse({ error: "Name required" }, true);
        }

        if (hard_delete) {
          const del = await pool.query(
            "DELETE FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
            [userId, name]
          );
          if (del.rows.length === 0) {
            return toolResponse({ error: `Program "${name}" not found` }, true);
          }
          return widgetResponse(
            `Program '${del.rows[0].name}' permanently deleted.`,
            { deleted: del.rows[0].name }
          );
        }

        const del = await pool.query(
          "UPDATE programs SET is_active = FALSE WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
          [userId, name]
        );
        if (del.rows.length === 0) {
          return toolResponse({ error: `Program "${name}" not found` }, true);
        }
        return widgetResponse(
          `Program '${del.rows[0].name}' deactivated.`,
          { deactivated: del.rows[0].name }
        );
      }

      if (action === "delete_bulk") {
        const namesList = parseJsonArrayParam<string>(rawNames);
        if (!namesList || !Array.isArray(namesList) || namesList.length === 0) {
          return toolResponse({ error: "names array required for delete_bulk" }, true);
        }

        const deleted: string[] = [];
        const not_found: string[] = [];

        for (const n of namesList) {
          if (hard_delete) {
            const { rows } = await pool.query(
              "DELETE FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
              [userId, n]
            );
            if (rows.length === 0) {
              not_found.push(n);
            } else {
              deleted.push(rows[0].name);
            }
          } else {
            const { rows } = await pool.query(
              "UPDATE programs SET is_active = FALSE WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
              [userId, n]
            );
            if (rows.length === 0) {
              not_found.push(n);
            } else {
              deleted.push(rows[0].name);
            }
          }
        }

        const key = hard_delete ? "deleted" : "deactivated";
        return widgetResponse(
          `${deleted.length} program(s) ${hard_delete ? "deleted" : "deactivated"}.`,
          { [key]: deleted, not_found: not_found.length > 0 ? not_found : undefined }
        );
      }

      if (action === "history") {
        const program = name
          ? await pool
              .query(
                "SELECT id, name FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
                [userId, name]
              )
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return toolResponse({ error: "Program not found" }, true);
        }

        const { rows: versions } = await pool.query(
          `SELECT version_number, change_description, created_at
           FROM program_versions WHERE program_id = $1 ORDER BY version_number DESC`,
          [program.id]
        );

        return widgetResponse(
          `${versions.length} version(s) of '${program.name}'.`,
          { program: program.name, versions }
        );
      }

      return toolResponse({ error: "Unknown action" }, true);
    }
  );
}
