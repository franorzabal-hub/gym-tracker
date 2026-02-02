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
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { insertGroup } from "../helpers/group-helpers.js";
import { cloneGroups } from "../helpers/group-helpers.js";

const soloExerciseSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1).default(3),
  reps: z.number().int().min(1).default(10),
  weight: z.number().nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  rest_seconds: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const groupSchema = z.object({
  group_type: z.enum(["superset", "paired", "circuit"]),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  rest_seconds: z.number().int().nullable().optional(),
  exercises: z.array(soloExerciseSchema).min(2),
});

const dayItemSchema = z.union([soloExerciseSchema, groupSchema]);

const daySchema = z.object({
  day_label: z.string(),
  weekdays: z.array(z.number().int().min(1).max(7)).nullable().optional(),
  exercises: z.array(dayItemSchema),
});

type DayItem = z.infer<typeof dayItemSchema>;

function isGroupItem(item: DayItem): item is z.infer<typeof groupSchema> {
  return "group_type" in item && "exercises" in item && Array.isArray((item as any).exercises);
}

/**
 * Insert a day's exercises (mix of solo and groups) into program_day_exercises.
 * Returns { created, existing } exercise name sets.
 */
async function insertDayItems(
  dayId: number,
  items: DayItem[],
  client: import("pg").PoolClient
): Promise<{ created: Set<string>; existing: Set<string> }> {
  const createdExercises = new Set<string>();
  const existingExercises = new Set<string>();
  let sortOrder = 0;

  for (const item of items) {
    if (isGroupItem(item)) {
      // Insert group row
      const groupId = await insertGroup(
        "program_exercise_groups", "day_id", dayId,
        { group_type: item.group_type, label: item.label, notes: item.notes, rest_seconds: item.rest_seconds },
        sortOrder, client
      );

      // Insert each exercise in the group
      for (const ex of item.exercises) {
        const resolved = await resolveExercise(ex.exercise, undefined, undefined, undefined, undefined, client);
        if (resolved.isNew) createdExercises.add(resolved.name);
        else existingExercises.add(resolved.name);

        await client.query(
          `INSERT INTO program_day_exercises
             (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [dayId, resolved.id, ex.sets, ex.reps, ex.weight || null, ex.rpe || null,
           sortOrder, groupId, null, ex.notes || null]
        );
        sortOrder++;
      }
    } else {
      // Solo exercise
      const resolved = await resolveExercise(item.exercise, undefined, undefined, undefined, undefined, client);
      if (resolved.isNew) createdExercises.add(resolved.name);
      else existingExercises.add(resolved.name);

      await client.query(
        `INSERT INTO program_day_exercises
           (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [dayId, resolved.id, item.sets, item.reps, item.weight || null, item.rpe || null,
         sortOrder, null, item.rest_seconds || null, item.notes || null]
      );
      sortOrder++;
    }
  }

  return { created: createdExercises, existing: existingExercises };
}

export function registerProgramTool(server: McpServer) {
  server.registerTool(
    "manage_program",
    {
      description: `${APP_CONTEXT}Manage workout programs (routines). A program is a weekly routine like PPL, Upper/Lower, Full Body.
Each program has versioned days with exercises. When updated, a new version is created preserving history.

Actions:
- "list": List all programs with their current version and active status
- "get": Get the current version of a program by name, with all days and exercises
- "create": Create a new program with days and exercises (auto-activates it)
- "clone": Clone an existing program (global template or another user's program) as a new user-owned program. Pass source_id (program id). Optionally pass name to override the program name. The cloned program is auto-activated. Global programs (templates) are shown by show_programs.
- "update": Modify a program. If "days" array is provided, creates a new version with updated days + change_description. If only metadata (new_name, description) is provided without days, updates the program metadata without creating a new version.
- "patch": Update a program's current version in-place (no new version created). Used by the widget for inline editing. Pass program_id (or name/active fallback). Optionally pass new_name, description for metadata. Pass days array to replace all days+exercises in the current version.
- "activate": Set a program as the active one (deactivates all others). Only one program can be active.
- "delete": Deactivate a program (soft delete). Use hard_delete=true to permanently remove with all versions/days/exercises (irreversible).
- "delete_bulk": Delete multiple programs at once. Pass "names" array. Optional hard_delete=true for permanent removal. Returns { deleted, not_found }.
- "history": List all versions of a program with dates and change descriptions

For "create" and "update" with days, pass the "days" array with day_label, weekdays (ISO: 1=Mon..7=Sun), and exercises.
The exercises array accepts two types of items:
1. Solo exercise: { exercise, sets, reps, weight?, rpe?, rest_seconds?, notes? }
2. Group: { group_type, label?, notes?, rest_seconds?, exercises: [solo_exercise, ...] }
   - group_type: "superset" (back-to-back no rest), "paired" (active rest), "circuit" (rotate)
   - label: optional display label (e.g. "Pecho + Hombro")
   - notes: group-level notes (e.g. "Sin descanso entre ejercicios")
   - rest_seconds: rest between rounds of the group
   - exercises: array of 2+ solo exercises (rest_seconds on individual exercises is ignored inside groups)
Discriminator: if the item has "exercise" (string) it's solo; if it has "group_type" + "exercises" (array) it's a group.
Each exercise needs: sets (number), reps (number — use the FIRST set's rep count), weight (optional, in kg).
If the rep scheme varies per set (e.g. pyramid 12/10/8), set reps to the first set's value (12) and put the full scheme in notes as "reps: 12/10/8". The widget displays it as "3×(12/10/8)" automatically.
If there's a progression instruction, append it in notes (e.g. "reps: 12/10/8 con progresión").
Do NOT put redundant rep info — either use a flat reps number OR put the varying scheme in notes, never both.
For "clone", pass source_id (the id of the program to clone, typically a global template).
For "update" with days, also pass change_description explaining what changed.
For "update" metadata only, pass new_name and/or description (no days needed).
For "activate", pass the program name.
When the user wants to SEE their program visually, call show_program instead (not manage_program with action "get").`,
      inputSchema: {
        action: z.enum(["list", "get", "create", "clone", "update", "patch", "activate", "delete", "delete_bulk", "history"]),
        name: z.string().optional(),
        program_id: z.number().int().optional().describe("Program ID (for patch action). Identifies which program to patch."),
        source_id: z.number().int().optional().describe("Program ID to clone (for clone action). Typically a global template program ID from show_programs."),
        new_name: z.string().optional().describe("New name for the program (update metadata only)"),
        description: z.string().optional(),
        days: z.union([z.array(daySchema), z.string()]).optional(),
        change_description: z.string().optional(),
        hard_delete: z.boolean().optional(),
        names: z.union([z.array(z.string()), z.string()]).optional().describe("Array of program names for delete_bulk"),
        include_exercises: z.boolean().optional().describe("If true, include exercise details for each day. Defaults to true"),
      },
      annotations: {},
    },
    safeHandler("manage_program", async ({ action, name, new_name, description, days: rawDays, change_description, hard_delete, names: rawNames, include_exercises, source_id, program_id }) => {
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
        return toolResponse({ active_program: active ? active.name : null, programs: rows });
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
          return toolResponse({
              program: {
                name: program.name,
                description: program.description,
                version: program.version_number,
                days,
              },
            });
        } else {
          // Return days without exercises
          const { rows: days } = await pool.query(
            `SELECT pd.id, pd.day_label, pd.weekdays, pd.sort_order
             FROM program_days pd
             WHERE pd.version_id = $1
             ORDER BY pd.sort_order`,
            [program.version_id]
          );
          return toolResponse({
              program: {
                name: program.name,
                description: program.description,
                version: program.version_number,
              },
              days,
            });
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

          const allCreated = new Set<string>();
          const allExisting = new Set<string>();

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            const { created, existing } = await insertDayItems(newDay.id, day.exercises, client);
            created.forEach(n => allCreated.add(n));
            existing.forEach(n => allExisting.add(n));
          }

          await client.query("COMMIT");

          return toolResponse({
              program: { id: prog.id, name, version: 1 },
              days_created: days.length,
              exercises_summary: {
                created: Array.from(allCreated),
                existing: Array.from(allExisting),
                total: allCreated.size + allExisting.size,
              },
            });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "clone") {
        if (!source_id) {
          return toolResponse({ error: "source_id is required. Pass the id of the program to clone (from show_programs)." }, true);
        }

        // Fetch source program (can be global or user-owned)
        const { rows: [source] } = await pool.query(
          `SELECT p.id, p.name, p.description, pv.id as version_id
           FROM programs p
           JOIN program_versions pv ON pv.program_id = p.id
           WHERE p.id = $1
           ORDER BY pv.version_number DESC LIMIT 1`,
          [source_id]
        );
        if (!source) {
          return toolResponse({ error: `Program with id ${source_id} not found.` }, true);
        }

        const programName = name || source.name;

        // Check if program name already exists for this user
        const existing = await pool.query(
          "SELECT id FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, programName]
        );
        if (existing.rows.length > 0) {
          return toolResponse({
            error: `Program "${programName}" already exists. Use a different name or delete the existing one first.`,
          }, true);
        }

        // Fetch source days + exercises
        const sourceDays = await getProgramDaysWithExercises(source.version_id);

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Deactivate other programs
          await client.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);

          const { rows: [prog] } = await client.query(
            `INSERT INTO programs (user_id, name, description, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id`,
            [userId, programName, source.description]
          );

          const { rows: [ver] } = await client.query(
            `INSERT INTO program_versions (program_id, version_number, change_description)
             VALUES ($1, 1, $2) RETURNING id`,
            [prog.id, `Cloned from "${source.name}"`]
          );

          for (let i = 0; i < sourceDays.length; i++) {
            const day = sourceDays[i];
            const { rows: [newDay] } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            // Clone groups for this day
            const groupMap = await cloneGroups(
              "program_exercise_groups", "program_exercise_groups",
              "day_id", "day_id",
              day.id, newDay.id,
              client
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  newDay.id,
                  ex.exercise_id,
                  ex.target_sets,
                  ex.target_reps,
                  ex.target_weight || null,
                  ex.target_rpe || null,
                  j,
                  ex.group_id ? (groupMap.get(ex.group_id) ?? null) : null,
                  ex.rest_seconds || null,
                  ex.notes || null,
                ]
              );
            }
          }

          await client.query("COMMIT");

          return toolResponse({
              program: { id: prog.id, name: programName, version: 1, source: source.name },
              days_created: sourceDays.length,
              total_exercises: sourceDays.reduce((sum: number, d: any) => sum + d.exercises.length, 0),
            });
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
          return toolResponse({ updated: rows[0] });
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

          const allCreated = new Set<string>();
          const allExisting = new Set<string>();

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            const { created, existing } = await insertDayItems(newDay.id, day.exercises, client);
            created.forEach(n => allCreated.add(n));
            existing.forEach(n => allExisting.add(n));
          }

          await client.query("COMMIT");

          return toolResponse({
              program: { name: name || program.name, version: newVersionNumber },
              change_description,
              exercises_summary: {
                created: Array.from(allCreated),
                existing: Array.from(allExisting),
                total: allCreated.size + allExisting.size,
              },
            });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "patch") {
        // Find program by program_id, name, or active
        let program: any;
        if (program_id) {
          program = await pool
            .query("SELECT id, name FROM programs WHERE id = $1 AND user_id = $2", [program_id, userId])
            .then(r => r.rows[0]);
        } else if (name) {
          program = await pool
            .query("SELECT id, name FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)", [userId, name])
            .then(r => r.rows[0]);
        } else {
          program = await getActiveProgram();
        }

        if (!program) {
          return toolResponse({ error: "Program not found" }, true);
        }

        const latestVersion = await getLatestVersion(program.id);
        if (!latestVersion) {
          return toolResponse({ error: "No version found" }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Update metadata if provided
          if (new_name) {
            await client.query(
              "UPDATE programs SET name = $1 WHERE id = $2 AND user_id = $3",
              [new_name, program.id, userId]
            );
          }
          if (description !== undefined && description !== null) {
            await client.query(
              "UPDATE programs SET description = $1 WHERE id = $2 AND user_id = $3",
              [description || null, program.id, userId]
            );
          }

          let daysCount = 0;
          let exercisesCount = 0;

          // Replace days if provided
          if (days && days.length > 0) {
            // Delete existing days (CASCADE deletes exercises and groups)
            await client.query(
              "DELETE FROM program_days WHERE version_id = $1",
              [latestVersion.id]
            );

            for (let i = 0; i < days.length; i++) {
              const day = days[i];
              const { rows: [newDay] } = await client.query(
                `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [latestVersion.id, day.day_label, day.weekdays || null, i]
              );
              daysCount++;

              // Count exercises (flatten groups)
              for (const item of day.exercises) {
                if (isGroupItem(item)) {
                  exercisesCount += item.exercises.length;
                } else {
                  exercisesCount++;
                }
              }

              await insertDayItems(newDay.id, day.exercises, client);
            }
          }

          await client.query("COMMIT");

          return toolResponse({
            program: {
              id: program.id,
              name: new_name || program.name,
              description: description !== undefined ? (description || null) : undefined,
              version: latestVersion.version_number,
            },
            days_count: daysCount || undefined,
            exercises_count: exercisesCount || undefined,
          });
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
        return toolResponse({ activated: prog.rows[0].name });
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
          return toolResponse({ deleted: del.rows[0].name });
        }

        const del = await pool.query(
          "UPDATE programs SET is_active = FALSE WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
          [userId, name]
        );
        if (del.rows.length === 0) {
          return toolResponse({ error: `Program "${name}" not found` }, true);
        }
        return toolResponse({ deactivated: del.rows[0].name });
      }

      if (action === "delete_bulk") {
        const namesList = parseJsonArrayParam<string>(rawNames);
        if (!namesList || !Array.isArray(namesList) || namesList.length === 0) {
          return toolResponse({ error: "names array required for delete_bulk" }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const deleted: string[] = [];
          const not_found: string[] = [];

          for (const n of namesList) {
            if (hard_delete) {
              const { rows } = await client.query(
                "DELETE FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
                [userId, n]
              );
              if (rows.length === 0) {
                not_found.push(n);
              } else {
                deleted.push(rows[0].name);
              }
            } else {
              const { rows } = await client.query(
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

          await client.query("COMMIT");
          const key = hard_delete ? "deleted" : "deactivated";
          return toolResponse({ [key]: deleted, not_found: not_found.length > 0 ? not_found : undefined });
        } catch (err) {
          await client.query("ROLLBACK").catch((rbErr) => console.error("[delete_bulk] ROLLBACK failed:", rbErr));
          throw err;
        } finally {
          client.release();
        }
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

        return toolResponse({ program: program.name, versions });
      }

      return toolResponse({ error: "Unknown action" }, true);
    })
  );
}
