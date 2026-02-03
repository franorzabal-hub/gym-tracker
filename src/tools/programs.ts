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
import { insertGroup, cloneGroups } from "../helpers/group-helpers.js";
import { insertSection, cloneSections } from "../helpers/section-helpers.js";

const soloExerciseSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1).default(3),
  reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1))]).default(10),
  weight: z.union([z.number(), z.array(z.number())]).nullable().optional(),
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

const sectionSchema = z.object({
  section: z.string(),
  notes: z.string().nullable().optional(),
  exercises: z.array(z.union([soloExerciseSchema, groupSchema])).min(1),
});

const dayItemSchema = z.union([soloExerciseSchema, groupSchema, sectionSchema]);

const daySchema = z.object({
  day_label: z.string(),
  weekdays: z.array(z.number().int().min(1).max(7)).nullable().optional(),
  exercises: z.array(dayItemSchema),
});

type DayItem = z.infer<typeof dayItemSchema>;

function isGroupItem(item: DayItem): item is z.infer<typeof groupSchema> {
  return "group_type" in item && "exercises" in item && Array.isArray((item as any).exercises) && !("section" in item);
}

function isSectionItem(item: DayItem): item is z.infer<typeof sectionSchema> {
  return "section" in item && "exercises" in item && Array.isArray((item as any).exercises);
}

/**
 * Insert a single exercise into program_day_exercises.
 */
async function insertSoloExercise(
  dayId: number,
  ex: z.infer<typeof soloExerciseSchema>,
  sortOrder: number,
  groupId: number | null,
  sectionId: number | null,
  client: import("pg").PoolClient,
  createdExercises: Set<string>,
  existingExercises: Set<string>
): Promise<void> {
  const resolved = await resolveExercise(ex.exercise, undefined, undefined, undefined, undefined, client);
  if (resolved.isNew) createdExercises.add(resolved.name);
  else existingExercises.add(resolved.name);

  // Handle per-set arrays for reps and weight
  const repsIsArray = Array.isArray(ex.reps);
  const targetReps = repsIsArray ? (ex.reps as number[])[0] : (ex.reps as number);
  const targetRepsPerSet = repsIsArray ? (ex.reps as number[]) : null;

  const weightIsArray = Array.isArray(ex.weight);
  const targetWeight = weightIsArray ? (ex.weight as number[])[0] : (ex.weight || null);
  const targetWeightPerSet = weightIsArray ? (ex.weight as number[]) : null;

  await client.query(
    `INSERT INTO program_day_exercises
       (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes, section_id, target_reps_per_set, target_weight_per_set)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [dayId, resolved.id, ex.sets, targetReps, targetWeight, ex.rpe || null,
     sortOrder, groupId, groupId ? null : (ex.rest_seconds || null), ex.notes || null, sectionId,
     targetRepsPerSet, targetWeightPerSet]
  );
}

/**
 * Insert items (solo exercises, groups, or sections) starting at a given sortOrder.
 * Returns { created, existing, nextSortOrder }.
 */
async function insertItems(
  dayId: number,
  items: Array<z.infer<typeof soloExerciseSchema> | z.infer<typeof groupSchema>>,
  startSortOrder: number,
  sectionId: number | null,
  client: import("pg").PoolClient,
  createdExercises: Set<string>,
  existingExercises: Set<string>
): Promise<number> {
  let sortOrder = startSortOrder;

  for (const item of items) {
    if (isGroupItem(item as DayItem)) {
      const group = item as z.infer<typeof groupSchema>;
      const groupId = await insertGroup(
        "program_exercise_groups", "day_id", dayId,
        { group_type: group.group_type, label: group.label, notes: group.notes, rest_seconds: group.rest_seconds },
        sortOrder, client
      );

      for (const ex of group.exercises) {
        await insertSoloExercise(dayId, ex, sortOrder, groupId, sectionId, client, createdExercises, existingExercises);
        sortOrder++;
      }
    } else {
      const solo = item as z.infer<typeof soloExerciseSchema>;
      await insertSoloExercise(dayId, solo, sortOrder, null, sectionId, client, createdExercises, existingExercises);
      sortOrder++;
    }
  }

  return sortOrder;
}

/**
 * Insert a day's exercises (mix of solo, groups, and sections) into program_day_exercises.
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
  let sectionSortOrder = 0;

  for (const item of items) {
    if (isSectionItem(item)) {
      // Insert section row
      const sectionId = await insertSection(
        "program_sections", "day_id", dayId,
        { label: item.section, notes: item.notes },
        sectionSortOrder++, client
      );

      // Insert the section's inner items (solo + groups) with this sectionId
      sortOrder = await insertItems(
        dayId, item.exercises, sortOrder, sectionId,
        client, createdExercises, existingExercises
      );
    } else if (isGroupItem(item)) {
      const groupId = await insertGroup(
        "program_exercise_groups", "day_id", dayId,
        { group_type: item.group_type, label: item.label, notes: item.notes, rest_seconds: item.rest_seconds },
        sortOrder, client
      );

      for (const ex of item.exercises) {
        await insertSoloExercise(dayId, ex, sortOrder, groupId, null, client, createdExercises, existingExercises);
        sortOrder++;
      }
    } else {
      await insertSoloExercise(dayId, item, sortOrder, null, null, client, createdExercises, existingExercises);
      sortOrder++;
    }
  }

  return { created: createdExercises, existing: existingExercises };
}

export function registerProgramTool(server: McpServer) {
  server.registerTool(
    "manage_program",
    {
      description: `${APP_CONTEXT}Manage workout programs. A program is a weekly routine (PPL, Upper/Lower, Full Body, etc.) with versioned days and exercises.

Actions:
- "list": List programs with version and active status
- "get": Get program by name with days and exercises
- "create": Create program with days/exercises (auto-activates)
- "clone": Clone a program (global template or user's). Pass source_id. Optionally pass name. Auto-activates.
- "update": If "days" provided → new version + change_description. If only metadata (new_name/description) → no new version.
- "patch": Update current version in-place (no new version). Pass program_id. For widget inline editing.
- "activate": Set as active (deactivates others). Only one active at a time.
- "delete": Soft delete. hard_delete=true for permanent removal.
- "delete_bulk": Delete multiple by "names" array. Optional hard_delete=true.
- "history": List all versions with dates and change descriptions

## Day structure

Pass "days" array with day_label, weekdays (ISO: 1=Mon..7=Sun), and exercises.
Exercises array accepts 3 item types (discriminator: "exercise" → solo, "group_type"+"exercises" → group, "section"+"exercises" → section):

1. Solo exercise: { exercise, sets, reps, weight?, rpe?, rest_seconds?, notes? }
2. Group: { group_type, label?, notes?, rest_seconds?, exercises: [2+ solo exercises] }
3. Section: { section, notes?, exercises: [solo or group items, no nesting] }

## Reps and weight (per-set targets)

reps and weight accept number OR array. Array length must equal sets.
- Uniform: reps: 10, weight: 80 → "3×10 · 80kg"
- Pyramid: reps: [12, 10, 8], weight: [80, 85, 90] → "3×(12/10/8) · 80→90kg" with expandable detail
- Mixed: reps: [12, 10, 8], weight: 80 (only reps vary) or reps: 10, weight: [80, 85, 90] (only weight varies)

## Group types — CRITICAL RULES

### superset: Equal-importance exercises back-to-back, rest after the round.
USE FOR: antagonist pairs (chest+back, bicep+tricep), warmup pairs where both exercises are equivalent.
EXAMPLE: Cable Fly 3x12 + Lateral Raise 3x15, rest 90s between rounds.

### paired: ONE principal exercise + ONE secondary done during its rest (active rest). Always exactly 2 exercises.
USE FOR: heavy compound + mobility/activation between sets. The secondary must NOT fatigue the principal.
CRITICAL: Array order is semantic — exercises[0] = principal (heavy), exercises[1] = secondary (mobility/corrective). Reversing breaks the semantics.
EXAMPLE: Deadlift 3x[12,10,8] + Hip Mobility 3x30s, rest 180s (secondary done within that rest).

### circuit: 2+ exercises rotated in sequence, rest only after completing the full round.
USE FOR: accessory blocks, conditioning, finishers.
EXAMPLE: Lat Pulldown 3x12 + Cable Row 3x12, rest 90s between rounds.

### Choosing the right type:
- Both exercises equal importance → superset
- One clearly principal + one for active rest → paired
- Block of accessories in rotation → circuit
- If there's no heavy principal exercise with long rest → it's NOT paired

## Sections — standard patterns

Sections are optional collapsible containers. Standard names:
- "Entrada en calor": warmup. Use superset for equal pairs. Do NOT use paired (no heavy principal exercise in warmup).
- "Trabajo principal": main work. Use paired (compound+mobility), superset (antagonists), circuit (accessories).
- "Cierre": cooldown, stretching. Prefer solo exercises (no groups needed).
The section defines WHEN in the workout; it does NOT imply group_type. Grouping depends on exercise relationship, not section.

## Rest seconds

- Solo exercise: rest_seconds = rest between sets.
- Grouped exercise: rest_seconds belongs to the GROUP (rest between rounds). The server DISCARDS rest_seconds on individual exercises inside groups.
- Superset/circuit: group rest_seconds = rest between complete rounds. No rest between exercises.
- Paired: group rest_seconds = total rest of the principal. Secondary is done within that time.

## Notes rules — avoid redundancy

Exercise notes: form cues, equipment variants, rep ranges. Shown as ⓘ tooltip.
Group notes: execution instructions that can't be expressed by structured fields.
Section notes: objective/focus of the section.

DO NOT put in notes:
- Info already in fields: "3 series de 10" (use sets/reps), "Descanso 90s" (use rest_seconds), "reps: 12/10/8" (use reps array)
- The definition of the group_type: "Sin descanso entre ejercicios" (= superset definition), "Movilidad durante el descanso" (= paired definition), "Circuito sin descanso entre ejercicios" (= circuit definition)
- Info already in the section: "Esto es entrada en calor" (section label says it)

## Fields NOT passed in program exercises

exercise_type and rep_type are resolved automatically from the exercises DB. Do NOT pass them.
- exercise_type (strength/mobility/cardio) describes the exercise's nature, not its position in the workout.
- "warmup" is NOT a valid exercise_type. An exercise in "Entrada en calor" section is still strength or mobility by nature.
- muscle_group is also resolved from the exercises DB. To set it, use manage_exercises.

To see the program visually, call show_program (not manage_program "get").`,
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

            // Clone sections for this day
            const sectionMap = await cloneSections(
              "program_sections", "program_sections",
              "day_id", "day_id",
              day.id, newDay.id,
              client
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes, section_id, target_reps_per_set, target_weight_per_set)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
                  ex.section_id ? (sectionMap.get(ex.section_id) ?? null) : null,
                  ex.target_reps_per_set || null,
                  ex.target_weight_per_set || null,
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

              // Count exercises (flatten groups and sections)
              for (const item of day.exercises) {
                if (isSectionItem(item)) {
                  for (const inner of item.exercises) {
                    if (isGroupItem(inner as DayItem)) {
                      exercisesCount += (inner as z.infer<typeof groupSchema>).exercises.length;
                    } else {
                      exercisesCount++;
                    }
                  }
                } else if (isGroupItem(item)) {
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
