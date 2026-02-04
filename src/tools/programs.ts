import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise, resolveExercisesBatch, ResolvedExercise } from "../helpers/exercise-resolver.js";
import {
  getActiveProgram,
  getLatestVersion,
  getProgramDaysWithExercises,
  cloneVersion,
  findProgramExercises,
  getProgramExerciseById,
  findProgramDays,
  getProgramDayById,
  formatExerciseContext,
} from "../helpers/program-helpers.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam, parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { insertGroup, cloneGroups, cloneGroupsBatch } from "../helpers/group-helpers.js";
import { insertSection, cloneSections, cloneSectionsBatch } from "../helpers/section-helpers.js";

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
 * Row structure for batch inserting exercises.
 */
interface ExerciseRow {
  day_id: number;
  exercise_id: number;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  sort_order: number;
  group_id: number | null;
  rest_seconds: number | null;
  notes: string | null;
  section_id: number | null;
  target_reps_per_set: number[] | null;
  target_weight_per_set: number[] | null;
}

/**
 * Batch insert exercises using unnest for efficiency.
 * Reduces N queries to 1 query per day.
 */
async function batchInsertExercises(
  rows: ExerciseRow[],
  client: import("pg").PoolClient
): Promise<void> {
  if (rows.length === 0) return;

  // Build arrays for unnest
  const dayIds: number[] = [];
  const exerciseIds: number[] = [];
  const targetSets: number[] = [];
  const targetReps: number[] = [];
  const targetWeights: (number | null)[] = [];
  const targetRpes: (number | null)[] = [];
  const sortOrders: number[] = [];
  const groupIds: (number | null)[] = [];
  const restSeconds: (number | null)[] = [];
  const notes: (string | null)[] = [];
  const sectionIds: (number | null)[] = [];
  const repsPerSet: (number[] | null)[] = [];
  const weightPerSet: (number[] | null)[] = [];

  for (const row of rows) {
    dayIds.push(row.day_id);
    exerciseIds.push(row.exercise_id);
    targetSets.push(row.target_sets);
    targetReps.push(row.target_reps);
    targetWeights.push(row.target_weight);
    targetRpes.push(row.target_rpe);
    sortOrders.push(row.sort_order);
    groupIds.push(row.group_id);
    restSeconds.push(row.rest_seconds);
    notes.push(row.notes);
    sectionIds.push(row.section_id);
    repsPerSet.push(row.target_reps_per_set);
    weightPerSet.push(row.target_weight_per_set);
  }

  // Use JSON for 2D arrays (repsPerSet, weightPerSet) to avoid pg driver serialization issues
  // when all elements are null. PostgreSQL's unnest with int[][] doesn't work well with all-null arrays
  // because the driver serializes [null, null] as '{NULL,NULL}' which pg interprets as 1D, not 2D.
  await client.query(
    `INSERT INTO program_day_exercises
       (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes, section_id, target_reps_per_set, target_weight_per_set)
     SELECT
       d.day_id, d.exercise_id, d.target_sets, d.target_reps, d.target_weight, d.target_rpe,
       d.sort_order, d.group_id, d.rest_seconds, d.notes, d.section_id,
       CASE WHEN rps.elem::text = 'null' THEN NULL
            ELSE (SELECT array_agg(x::int) FROM jsonb_array_elements_text(rps.elem) x)
       END,
       CASE WHEN wps.elem::text = 'null' THEN NULL
            ELSE (SELECT array_agg(x::real) FROM jsonb_array_elements_text(wps.elem) x)
       END
     FROM unnest(
       $1::int[], $2::int[], $3::int[], $4::int[], $5::real[], $6::real[],
       $7::int[], $8::int[], $9::int[], $10::text[], $11::int[]
     ) WITH ORDINALITY AS d(day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes, section_id, ord)
     JOIN LATERAL jsonb_array_elements($12::jsonb) WITH ORDINALITY AS rps(elem, ord) ON rps.ord = d.ord
     JOIN LATERAL jsonb_array_elements($13::jsonb) WITH ORDINALITY AS wps(elem, ord) ON wps.ord = d.ord`,
    [dayIds, exerciseIds, targetSets, targetReps, targetWeights, targetRpes,
     sortOrders, groupIds, restSeconds, notes, sectionIds,
     JSON.stringify(repsPerSet), JSON.stringify(weightPerSet)]
  );
}

/**
 * Collect all exercise names from a flat list of items (solo or group).
 */
function collectExerciseNamesFromItems(items: Array<z.infer<typeof soloExerciseSchema> | z.infer<typeof groupSchema>>): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (isGroupItem(item as DayItem)) {
      const group = item as z.infer<typeof groupSchema>;
      for (const ex of group.exercises) {
        names.push(ex.exercise);
      }
    } else {
      const solo = item as z.infer<typeof soloExerciseSchema>;
      names.push(solo.exercise);
    }
  }
  return names;
}

/**
 * Collect all exercise names from a day's items (including nested in groups/sections).
 */
function collectExerciseNames(items: DayItem[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    if (isSectionItem(item)) {
      names.push(...collectExerciseNamesFromItems(item.exercises));
    } else if (isGroupItem(item)) {
      for (const ex of item.exercises) {
        names.push(ex.exercise);
      }
    } else {
      names.push(item.exercise);
    }
  }
  return names;
}

/**
 * Build an ExerciseRow (without inserting) from a solo exercise schema using a pre-resolved exercise map.
 * Updates createdExercises/existingExercises sets as side effects.
 */
function buildExerciseRow(
  dayId: number,
  ex: z.infer<typeof soloExerciseSchema>,
  sortOrder: number,
  groupId: number | null,
  sectionId: number | null,
  exerciseMap: Map<string, ResolvedExercise>,
  createdExercises: Set<string>,
  existingExercises: Set<string>
): ExerciseRow {
  const resolved = exerciseMap.get(ex.exercise.trim().toLowerCase());
  if (!resolved) {
    throw new Error(`Exercise "${ex.exercise}" not found in batch resolution map`);
  }

  if (resolved.isNew) createdExercises.add(resolved.name);
  else existingExercises.add(resolved.name);

  // Handle per-set arrays for reps and weight
  const repsIsArray = Array.isArray(ex.reps);
  const targetReps = repsIsArray ? (ex.reps as number[])[0] : (ex.reps as number);
  const targetRepsPerSet = repsIsArray ? (ex.reps as number[]) : null;

  const weightIsArray = Array.isArray(ex.weight);
  const targetWeight: number | null = weightIsArray ? (ex.weight as number[])[0] : ((ex.weight as number | null | undefined) || null);
  const targetWeightPerSet = weightIsArray ? (ex.weight as number[]) : null;

  return {
    day_id: dayId,
    exercise_id: resolved.id,
    target_sets: ex.sets,
    target_reps: targetReps,
    target_weight: targetWeight,
    target_rpe: ex.rpe || null,
    sort_order: sortOrder,
    group_id: groupId,
    rest_seconds: groupId ? null : (ex.rest_seconds || null),
    notes: ex.notes || null,
    section_id: sectionId,
    target_reps_per_set: targetRepsPerSet,
    target_weight_per_set: targetWeightPerSet,
  };
}

/**
 * Collect exercise rows from items (solo exercises, groups) with pre-resolved exercise map.
 * Returns { rows, nextSortOrder }. Groups are inserted inline to get IDs.
 */
async function collectItemRows(
  dayId: number,
  items: Array<z.infer<typeof soloExerciseSchema> | z.infer<typeof groupSchema>>,
  startSortOrder: number,
  sectionId: number | null,
  client: import("pg").PoolClient,
  exerciseMap: Map<string, ResolvedExercise>,
  createdExercises: Set<string>,
  existingExercises: Set<string>
): Promise<{ rows: ExerciseRow[]; nextSortOrder: number }> {
  const rows: ExerciseRow[] = [];
  let sortOrder = startSortOrder;

  for (const item of items) {
    if (isGroupItem(item as DayItem)) {
      const group = item as z.infer<typeof groupSchema>;
      // Groups need to be inserted to get their ID (1 query per group)
      const groupId = await insertGroup(
        "program_exercise_groups", "day_id", dayId,
        { group_type: group.group_type, label: group.label, notes: group.notes, rest_seconds: group.rest_seconds },
        sortOrder, client
      );

      for (const ex of group.exercises) {
        rows.push(buildExerciseRow(dayId, ex, sortOrder, groupId, sectionId, exerciseMap, createdExercises, existingExercises));
        sortOrder++;
      }
    } else {
      const solo = item as z.infer<typeof soloExerciseSchema>;
      rows.push(buildExerciseRow(dayId, solo, sortOrder, null, sectionId, exerciseMap, createdExercises, existingExercises));
      sortOrder++;
    }
  }

  return { rows, nextSortOrder: sortOrder };
}

/**
 * Insert a day's exercises (mix of solo, groups, and sections) into program_day_exercises.
 * Uses batch exercise resolution (1-2 queries) and batch INSERT (1 query for all exercises).
 * Returns { created, existing } exercise name sets.
 */
async function insertDayItems(
  dayId: number,
  items: DayItem[],
  client: import("pg").PoolClient,
  userId: number
): Promise<{ created: Set<string>; existing: Set<string> }> {
  const createdExercises = new Set<string>();
  const existingExercises = new Set<string>();

  // Step 1: Collect all exercise names
  const exerciseNames = collectExerciseNames(items);

  // Step 2: Batch resolve (1-2 queries instead of 3N)
  const exerciseMap = await resolveExercisesBatch(exerciseNames, userId, client);

  // Step 3: Collect all exercise rows (groups/sections inserted to get IDs)
  const allRows: ExerciseRow[] = [];
  let sortOrder = 0;
  let sectionSortOrder = 0;

  for (const item of items) {
    if (isSectionItem(item)) {
      // Insert section row (1 query per section)
      const sectionId = await insertSection(
        "program_sections", "day_id", dayId,
        { label: item.section, notes: item.notes },
        sectionSortOrder++, client
      );

      // Collect rows from the section's inner items
      const { rows, nextSortOrder } = await collectItemRows(
        dayId, item.exercises, sortOrder, sectionId,
        client, exerciseMap, createdExercises, existingExercises
      );
      allRows.push(...rows);
      sortOrder = nextSortOrder;
    } else if (isGroupItem(item)) {
      // Insert group row (1 query per group)
      const groupId = await insertGroup(
        "program_exercise_groups", "day_id", dayId,
        { group_type: item.group_type, label: item.label, notes: item.notes, rest_seconds: item.rest_seconds },
        sortOrder, client
      );

      for (const ex of item.exercises) {
        allRows.push(buildExerciseRow(dayId, ex, sortOrder, groupId, null, exerciseMap, createdExercises, existingExercises));
        sortOrder++;
      }
    } else {
      allRows.push(buildExerciseRow(dayId, item, sortOrder, null, null, exerciseMap, createdExercises, existingExercises));
      sortOrder++;
    }
  }

  // Step 4: Batch INSERT all exercises (1 query instead of N)
  await batchInsertExercises(allRows, client);

  return { created: createdExercises, existing: existingExercises };
}

export function registerProgramTool(server: McpServer) {
  server.registerTool(
    "manage_program",
    {
      description: `${APP_CONTEXT}Manage workout programs (weekly routines with days and exercises).

## DECISION GUIDE — Which action to use?

| I want to...                                    | Action              |
|-------------------------------------------------|---------------------|
| Create a new program from scratch               | create              |
| Copy a template or existing program             | clone               |
| Change weight/reps/sets of ONE exercise         | patch_exercise      |
| Move exercise to different section/day/position | move_exercise       |
| Reorder all exercises in a day                  | reorder_exercises   |
| Add a new exercise to existing day              | add_exercise        |
| Remove an exercise from a day                   | remove_exercise     |
| Change day name or weekdays                     | patch_day           |
| Restructure entire program (new version)        | update (with days)  |
| Change program name/description only            | update (no days)    |
| Switch active program                           | activate            |
| Delete program(s)                               | delete/delete_bulk  |
| See version history                             | history             |

## Actions Reference

**Read:** list, get, history
**Create:** create, clone
**Modify (no version):** patch_exercise, patch_day, add_exercise, remove_exercise, move_exercise, reorder_exercises
**Modify (new version):** update (with days), patch (with days)
**Lifecycle:** activate, delete, delete_bulk, validate

## Identifying exercises for patch actions

Use program_day_exercise_id (precise) OR day + exercise name (convenient).
If multiple exercises match, returns { ambiguous: true, matches: [...] }. Ask user which one, retry with the specific ID.

## Day structure (for create/update/clone)

days: [{ day_label, weekdays?, exercises: [items...] }]

Items can be:
- Solo: { exercise, sets, reps, weight?, rpe?, rest_seconds?, notes? }
- Group: { group_type: "superset"|"paired"|"circuit", rest_seconds?, exercises: [2+ solos] }
- Section: { section: "Entrada en calor", exercises: [solos or groups] }

## Group types

- **superset**: Equal exercises back-to-back, rest after round. Use for antagonist pairs, warmup pairs.
- **paired**: Principal + secondary during rest. ALWAYS 2 exercises, order matters (principal first). Use for compound + mobility.
- **circuit**: 2+ exercises in rotation, rest after full round. Use for accessories, finishers.

## Sections

Standard names: "Entrada en calor" (warmup), "Trabajo principal" (main), "Cierre" (cooldown).
Section defines WHEN; group_type defines HOW exercises relate.

## Reps/weight arrays

Uniform: reps: 10 → same all sets
Pyramid: reps: [12, 10, 8] → per-set (length must equal sets)`,
      inputSchema: {
        action: z.enum(["list", "get", "create", "clone", "update", "patch", "activate", "delete", "delete_bulk", "history", "validate", "patch_exercise", "patch_day", "add_exercise", "remove_exercise", "move_exercise", "reorder_exercises"]),
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
        // Patch action params
        program_day_exercise_id: z.number().int().optional().describe("ID of specific exercise entry in program (from show_program or ambiguity response)"),
        day_id: z.number().int().optional().describe("ID of specific day in program"),
        day: z.string().optional().describe("Day label (e.g., 'Día 1', 'Push') for patch actions"),
        exercise: z.string().optional().describe("Exercise name for patch_exercise/add_exercise/remove_exercise"),
        sets: z.number().int().min(1).optional().describe("Target sets for patch_exercise/add_exercise"),
        reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1)), z.string()]).optional().describe("Target reps (number or per-set array) for patch_exercise/add_exercise"),
        weight: z.union([z.number(), z.array(z.number()), z.string()]).nullable().optional().describe("Target weight (number or per-set array) for patch_exercise/add_exercise"),
        rpe: z.number().min(1).max(10).nullable().optional().describe("Target RPE for patch_exercise/add_exercise"),
        rest_seconds: z.number().int().nullable().optional().describe("Rest seconds for patch_exercise/add_exercise"),
        exercise_notes: z.string().nullable().optional().describe("Notes for the exercise"),
        new_label: z.string().optional().describe("New day label for patch_day"),
        weekdays: z.union([z.array(z.number().int().min(1).max(7)), z.string()]).optional().describe("Weekdays array (ISO 1=Mon..7=Sun) for patch_day"),
        position: z.number().int().min(0).optional().describe("Sort order position for add_exercise/move_exercise (default: end)"),
        target_group_id: z.number().int().optional().describe("Group ID to add exercise into (for add_exercise)"),
        target_section_id: z.number().int().optional().describe("Section ID to move/add exercise into"),
        target_day_id: z.number().int().optional().describe("Day ID to move exercise to (for move_exercise, cross-day moves)"),
        order: z.union([z.array(z.number().int()), z.string()]).optional().describe("Array of program_day_exercise_ids in desired order (for reorder_exercises)"),
      },
      annotations: {},
    },
    safeHandler("manage_program", async ({
      action, name, new_name, description, days: rawDays, change_description, hard_delete,
      names: rawNames, include_exercises, source_id, program_id,
      // Patch action params
      program_day_exercise_id, day_id, day, exercise, sets, reps: rawReps, weight: rawWeight,
      rpe, rest_seconds, exercise_notes, new_label, weekdays: rawWeekdays, position,
      target_group_id, target_section_id, target_day_id, order: rawOrder
    }) => {
      const userId = getUserId();

      // Some MCP clients serialize nested arrays as JSON strings
      const days = parseJsonParam<any[]>(rawDays);
      const reps = parseJsonParam<number | number[]>(rawReps) ?? rawReps;
      const weight = parseJsonParam<number | number[] | null>(rawWeight) ?? rawWeight;
      const weekdays = parseJsonParam<number[]>(rawWeekdays) ?? rawWeekdays;
      const order = parseJsonParam<number[]>(rawOrder) ?? rawOrder;

      if (action === "list") {
        // Use CTE with DISTINCT ON to avoid correlated subqueries
        const { rows } = await pool.query(
          `WITH latest_versions AS (
             SELECT DISTINCT ON (program_id)
               id, program_id, version_number
             FROM program_versions
             ORDER BY program_id, version_number DESC
           )
           SELECT
             p.id, p.name, p.description, p.is_active,
             lv.version_number as current_version,
             COUNT(pd.id)::int as days_count
           FROM programs p
           LEFT JOIN latest_versions lv ON lv.program_id = p.id
           LEFT JOIN program_days pd ON pd.version_id = lv.id
           WHERE p.user_id = $1
           GROUP BY p.id, p.name, p.description, p.is_active, lv.version_number
           ORDER BY p.is_active DESC, p.name`,
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

          // Check if user requires validation for new programs
          const { rows: profileRows } = await client.query(
            "SELECT data->>'requires_validation' as req_val FROM user_profile WHERE user_id = $1",
            [userId]
          );
          const requiresValidation = profileRows[0]?.req_val === 'true';

          // Deactivate other programs for this user
          await client.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);

          const {
            rows: [prog],
          } = await client.query(
            `INSERT INTO programs (user_id, name, description, is_active, is_validated) VALUES ($1, $2, $3, TRUE, $4)
             RETURNING id`,
            [userId, name, description || null, !requiresValidation]
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

            const { created, existing } = await insertDayItems(newDay.id, day.exercises, client, userId);
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
           WHERE p.id = $1 AND (p.user_id IS NULL OR p.user_id = $2)
           ORDER BY pv.version_number DESC LIMIT 1`,
          [source_id, userId]
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

          // Check if user requires validation for new programs
          const { rows: profileRows } = await client.query(
            "SELECT data->>'requires_validation' as req_val FROM user_profile WHERE user_id = $1",
            [userId]
          );
          const requiresValidation = profileRows[0]?.req_val === 'true';

          // Deactivate other programs
          await client.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);

          const { rows: [prog] } = await client.query(
            `INSERT INTO programs (user_id, name, description, is_active, is_validated) VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
            [userId, programName, source.description, !requiresValidation]
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

            // Clone groups for this day (batch: 1 query instead of N)
            const groupMap = await cloneGroupsBatch(
              "program_exercise_groups", "program_exercise_groups",
              "day_id", "day_id",
              day.id, newDay.id,
              client
            );

            // Clone sections for this day (batch: 1 query instead of N)
            const sectionMap = await cloneSectionsBatch(
              "program_sections", "program_sections",
              "day_id", "day_id",
              day.id, newDay.id,
              client
            );

            // Batch insert all exercises for this day (1 query instead of N)
            const exerciseRows: ExerciseRow[] = day.exercises.map((ex: any, j: number) => ({
              day_id: newDay.id,
              exercise_id: ex.exercise_id,
              target_sets: ex.target_sets,
              target_reps: ex.target_reps,
              target_weight: ex.target_weight || null,
              target_rpe: ex.target_rpe || null,
              sort_order: j,
              group_id: ex.group_id ? (groupMap.get(ex.group_id) ?? null) : null,
              rest_seconds: ex.rest_seconds || null,
              notes: ex.notes || null,
              section_id: ex.section_id ? (sectionMap.get(ex.section_id) ?? null) : null,
              target_reps_per_set: ex.target_reps_per_set || null,
              target_weight_per_set: ex.target_weight_per_set || null,
            }));
            await batchInsertExercises(exerciseRows, client);
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

            const { created, existing } = await insertDayItems(newDay.id, day.exercises, client, userId);
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
        // If caller provided days but they failed to parse, fail fast (avoid silently ignoring edits)
        if (rawDays !== undefined && (!days || !Array.isArray(days))) {
          return toolResponse({ error: "Invalid days array" }, true);
        }

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

        const replaceDays = Array.isArray(days) && days.length > 0;

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
          if (description !== undefined) {
            await client.query(
              "UPDATE programs SET description = $1 WHERE id = $2 AND user_id = $3",
              [description || null, program.id, userId]
            );
          }

          let daysCount = 0;
          let exercisesCount = 0;

          // If days are provided, create a new version (preserves history/session links)
          let effectiveVersionNumber: number = latestVersion.version_number;
          let targetVersionId: number = latestVersion.id;

          if (replaceDays) {
            effectiveVersionNumber = latestVersion.version_number + 1;

            const { rows: [ver] } = await client.query(
              `INSERT INTO program_versions (program_id, version_number, change_description)
               VALUES ($1, $2, $3) RETURNING id`,
              [program.id, effectiveVersionNumber, change_description || "Updated via widget"]
            );
            targetVersionId = ver.id;

            for (let i = 0; i < days.length; i++) {
              const day = days[i];
              const { rows: [newDay] } = await client.query(
                `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [targetVersionId, day.day_label, day.weekdays || null, i]
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

              await insertDayItems(newDay.id, day.exercises, client, userId);
            }
          }

          await client.query("COMMIT");

          return toolResponse({
            program: {
              id: program.id,
              name: new_name || program.name,
              description: description !== undefined ? (description || null) : undefined,
              version: effectiveVersionNumber,
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

        // Normalize names for case-insensitive comparison
        const lowerNames = namesList.map(n => n.toLowerCase());

        if (hard_delete) {
          // Batch delete with single query
          const { rows } = await pool.query(
            `DELETE FROM programs
             WHERE user_id = $1 AND LOWER(name) = ANY($2::text[])
             RETURNING name`,
            [userId, lowerNames]
          );
          const deletedNames = new Set(rows.map(r => r.name.toLowerCase()));
          const deleted = rows.map(r => r.name);
          const not_found = namesList.filter(n => !deletedNames.has(n.toLowerCase()));

          return toolResponse({
            deleted,
            not_found: not_found.length > 0 ? not_found : undefined
          });
        } else {
          // Batch deactivate with single query
          const { rows } = await pool.query(
            `UPDATE programs SET is_active = FALSE
             WHERE user_id = $1 AND LOWER(name) = ANY($2::text[])
             RETURNING name`,
            [userId, lowerNames]
          );
          const deactivatedNames = new Set(rows.map(r => r.name.toLowerCase()));
          const deactivated = rows.map(r => r.name);
          const not_found = namesList.filter(n => !deactivatedNames.has(n.toLowerCase()));

          return toolResponse({
            deactivated,
            not_found: not_found.length > 0 ? not_found : undefined
          });
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

      if (action === "validate") {
        // Find program by program_id, name, or active
        let program: any;
        if (program_id) {
          program = await pool
            .query("SELECT id, name, is_validated FROM programs WHERE id = $1 AND user_id = $2", [program_id, userId])
            .then(r => r.rows[0]);
        } else if (name) {
          program = await pool
            .query("SELECT id, name, is_validated FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)", [userId, name])
            .then(r => r.rows[0]);
        } else {
          // getActiveProgram() already returns is_validated
          program = await getActiveProgram();
        }

        if (!program) {
          return toolResponse({ error: "Program not found" }, true);
        }

        if (program.is_validated) {
          return toolResponse({ message: "Program is already validated", program_id: program.id, name: program.name });
        }

        await pool.query(
          "UPDATE programs SET is_validated = true WHERE id = $1 AND user_id = $2",
          [program.id, userId]
        );

        return toolResponse({ validated: true, program_id: program.id, name: program.name });
      }

      // ========== PATCH ACTIONS (inline updates without versioning) ==========

      if (action === "patch_exercise") {
        // Find exercise by ID or by day+name
        let target;

        if (program_day_exercise_id) {
          target = await getProgramExerciseById(userId, program_day_exercise_id);
          if (!target) {
            return toolResponse({ error: "Exercise not found in your program" }, true);
          }
        } else if (day && exercise) {
          const matches = await findProgramExercises(userId, day, exercise, name);

          if (matches.length === 0) {
            return toolResponse({ error: `Exercise "${exercise}" not found in "${day}"` }, true);
          }

          if (matches.length > 1) {
            // Ambiguity → return options for LLM to ask user
            return toolResponse({
              ambiguous: true,
              message: `Found ${matches.length} "${exercise}" in "${day}". Ask user which one, then retry with program_day_exercise_id.`,
              matches: matches.map(m => ({
                program_day_exercise_id: m.program_day_exercise_id,
                context: formatExerciseContext(m),
              })),
            });
          }

          target = matches[0];
        } else {
          return toolResponse({ error: "Provide program_day_exercise_id OR (day + exercise)" }, true);
        }

        // Build dynamic UPDATE
        const updates: string[] = [];
        const params: any[] = [];

        if (sets !== undefined) {
          params.push(sets);
          updates.push(`target_sets = $${params.length}`);
        }
        if (reps !== undefined) {
          const repsIsArray = Array.isArray(reps);
          params.push(repsIsArray ? (reps as number[])[0] : reps);
          updates.push(`target_reps = $${params.length}`);
          params.push(repsIsArray ? reps : null);
          updates.push(`target_reps_per_set = $${params.length}`);
        }
        if (weight !== undefined) {
          const weightIsArray = Array.isArray(weight);
          params.push(weight === null ? null : (weightIsArray ? (weight as number[])[0] : weight));
          updates.push(`target_weight = $${params.length}`);
          params.push(weight === null ? null : (weightIsArray ? weight : null));
          updates.push(`target_weight_per_set = $${params.length}`);
        }
        if (rpe !== undefined) {
          params.push(rpe);
          updates.push(`target_rpe = $${params.length}`);
        }
        if (rest_seconds !== undefined) {
          params.push(rest_seconds);
          updates.push(`rest_seconds = $${params.length}`);
        }
        if (exercise_notes !== undefined) {
          params.push(exercise_notes);
          updates.push(`notes = $${params.length}`);
        }

        if (updates.length === 0) {
          return toolResponse({ error: "No fields to update. Provide sets, reps, weight, rpe, rest_seconds, or exercise_notes." }, true);
        }

        params.push(target.program_day_exercise_id);
        await pool.query(
          `UPDATE program_day_exercises SET ${updates.join(", ")} WHERE id = $${params.length}`,
          params
        );

        return toolResponse({
          updated: true,
          program_day_exercise_id: target.program_day_exercise_id,
          fields_updated: updates.length,
        });
      }

      if (action === "patch_day") {
        // Find day by ID or by label
        let target;

        if (day_id) {
          target = await getProgramDayById(userId, day_id);
          if (!target) {
            return toolResponse({ error: "Day not found in your program" }, true);
          }
        } else if (day) {
          const matches = await findProgramDays(userId, day, name);

          if (matches.length === 0) {
            return toolResponse({ error: `Day "${day}" not found` }, true);
          }

          if (matches.length > 1) {
            // Ambiguity (rare but possible with duplicate labels)
            return toolResponse({
              ambiguous: true,
              message: `Found ${matches.length} days labeled "${day}". Ask user which one, then retry with day_id.`,
              matches: matches.map(m => ({
                day_id: m.day_id,
                context: `posición ${m.sort_order + 1}, weekdays: ${m.weekdays?.join(",") || "none"}`,
              })),
            });
          }

          target = matches[0];
        } else {
          return toolResponse({ error: "Provide day_id OR day (label)" }, true);
        }

        // Build dynamic UPDATE
        const updates: string[] = [];
        const params: any[] = [];

        if (new_label) {
          params.push(new_label);
          updates.push(`day_label = $${params.length}`);
        }
        if (weekdays !== undefined) {
          params.push(Array.isArray(weekdays) ? weekdays : null);
          updates.push(`weekdays = $${params.length}`);
        }

        if (updates.length === 0) {
          return toolResponse({ error: "No fields to update. Provide new_label or weekdays." }, true);
        }

        params.push(target.day_id);
        await pool.query(
          `UPDATE program_days SET ${updates.join(", ")} WHERE id = $${params.length}`,
          params
        );

        return toolResponse({
          updated: true,
          day_id: target.day_id,
          new_label: new_label || undefined,
        });
      }

      if (action === "add_exercise") {
        if (!exercise) {
          return toolResponse({ error: "exercise name required" }, true);
        }

        // Find target day
        let targetDay;
        if (day_id) {
          targetDay = await getProgramDayById(userId, day_id);
        } else if (day) {
          const matches = await findProgramDays(userId, day, name);
          if (matches.length === 0) {
            return toolResponse({ error: `Day "${day}" not found` }, true);
          }
          if (matches.length > 1) {
            return toolResponse({
              ambiguous: true,
              message: `Found ${matches.length} days labeled "${day}". Ask user which one, then retry with day_id.`,
              matches: matches.map(m => ({
                day_id: m.day_id,
                context: `posición ${m.sort_order + 1}`,
              })),
            });
          }
          targetDay = matches[0];
        } else {
          return toolResponse({ error: "Provide day_id OR day (label)" }, true);
        }

        if (!targetDay) {
          return toolResponse({ error: "Day not found" }, true);
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Resolve exercise (creates if needed)
          const resolved = await resolveExercise(exercise, undefined, undefined, undefined, undefined, client);

          // Get max sort_order for this day
          const { rows: [maxSort] } = await client.query(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM program_day_exercises WHERE day_id = $1",
            [targetDay.day_id]
          );
          const sortOrder = position ?? maxSort.next;

          // Handle per-set arrays
          const repsIsArray = Array.isArray(reps);
          const weightIsArray = Array.isArray(weight);

          const { rows: [inserted] } = await client.query(
            `INSERT INTO program_day_exercises
               (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe,
                sort_order, group_id, section_id, rest_seconds, notes, target_reps_per_set, target_weight_per_set)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
              targetDay.day_id,
              resolved.id,
              sets ?? 3,
              repsIsArray ? (reps as number[])[0] : (reps ?? 10),
              weight === null || weight === undefined ? null : (weightIsArray ? (weight as number[])[0] : weight),
              rpe ?? null,
              sortOrder,
              target_group_id ?? null,
              target_section_id ?? null,
              rest_seconds ?? null,
              exercise_notes ?? null,
              repsIsArray ? reps : null,
              weightIsArray ? weight : null,
            ]
          );

          await client.query("COMMIT");

          return toolResponse({
            added: true,
            program_day_exercise_id: inserted.id,
            exercise: resolved.name,
            exercise_created: resolved.isNew,
            day: targetDay.day_label,
          });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "remove_exercise") {
        // Find exercise by ID or by day+name
        let target;

        if (program_day_exercise_id) {
          target = await getProgramExerciseById(userId, program_day_exercise_id);
          if (!target) {
            return toolResponse({ error: "Exercise not found in your program" }, true);
          }
        } else if (day && exercise) {
          const matches = await findProgramExercises(userId, day, exercise, name);

          if (matches.length === 0) {
            return toolResponse({ error: `Exercise "${exercise}" not found in "${day}"` }, true);
          }

          if (matches.length > 1) {
            return toolResponse({
              ambiguous: true,
              message: `Found ${matches.length} "${exercise}" in "${day}". Ask user which one, then retry with program_day_exercise_id.`,
              matches: matches.map(m => ({
                program_day_exercise_id: m.program_day_exercise_id,
                context: formatExerciseContext(m),
              })),
            });
          }

          target = matches[0];
        } else {
          return toolResponse({ error: "Provide program_day_exercise_id OR (day + exercise)" }, true);
        }

        await pool.query("DELETE FROM program_day_exercises WHERE id = $1", [target.program_day_exercise_id]);

        return toolResponse({
          removed: true,
          program_day_exercise_id: target.program_day_exercise_id,
        });
      }

      if (action === "move_exercise") {
        // Find exercise by ID or by day+name
        let target;

        if (program_day_exercise_id) {
          target = await getProgramExerciseById(userId, program_day_exercise_id);
          if (!target) {
            return toolResponse({ error: "Exercise not found in your program" }, true);
          }
        } else if (day && exercise) {
          const matches = await findProgramExercises(userId, day, exercise, name);

          if (matches.length === 0) {
            return toolResponse({ error: `Exercise "${exercise}" not found in "${day}"` }, true);
          }

          if (matches.length > 1) {
            return toolResponse({
              ambiguous: true,
              message: `Found ${matches.length} "${exercise}" in "${day}". Ask user which one, then retry with program_day_exercise_id.`,
              matches: matches.map(m => ({
                program_day_exercise_id: m.program_day_exercise_id,
                context: formatExerciseContext(m),
              })),
            });
          }

          target = matches[0];
        } else {
          return toolResponse({ error: "Provide program_day_exercise_id OR (day + exercise)" }, true);
        }

        // Determine what to update
        const updates: string[] = [];
        const params: any[] = [];

        // Cross-day move
        if (target_day_id !== undefined && target_day_id !== target.day_id) {
          // Verify target day belongs to user's program
          const { rows: [targetDay] } = await pool.query(
            `SELECT pd.id FROM program_days pd
             JOIN program_versions pv ON pv.id = pd.version_id
             JOIN programs p ON p.id = pv.program_id
             WHERE pd.id = $1 AND p.user_id = $2`,
            [target_day_id, userId]
          );
          if (!targetDay) {
            return toolResponse({ error: "Target day not found in your program" }, true);
          }
          params.push(target_day_id);
          updates.push(`day_id = $${params.length}`);
        }

        // Section change
        if (target_section_id !== undefined) {
          // null is valid (removes from section)
          params.push(target_section_id);
          updates.push(`section_id = $${params.length}`);
        }

        // Group change (null removes from group)
        if (target_group_id !== undefined) {
          params.push(target_group_id);
          updates.push(`group_id = $${params.length}`);
        }

        // Position change
        if (position !== undefined) {
          params.push(position);
          updates.push(`sort_order = $${params.length}`);
        }

        if (updates.length === 0) {
          return toolResponse({ error: "No move target specified. Provide target_day_id, target_section_id, target_group_id, or position." }, true);
        }

        params.push(target.program_day_exercise_id);
        await pool.query(
          `UPDATE program_day_exercises SET ${updates.join(", ")} WHERE id = $${params.length}`,
          params
        );

        return toolResponse({
          moved: true,
          program_day_exercise_id: target.program_day_exercise_id,
          updates: {
            day_id: target_day_id,
            section_id: target_section_id,
            group_id: target_group_id,
            position,
          },
        });
      }

      if (action === "reorder_exercises") {
        if (!order || !Array.isArray(order) || order.length === 0) {
          return toolResponse({ error: "order array required (array of program_day_exercise_ids in desired order)" }, true);
        }

        // Verify all exercises exist and belong to user, and get their day_id
        const { rows: exercises } = await pool.query(
          `SELECT pde.id, pde.day_id
           FROM program_day_exercises pde
           JOIN program_days pd ON pd.id = pde.day_id
           JOIN program_versions pv ON pv.id = pd.version_id
           JOIN programs p ON p.id = pv.program_id
           WHERE pde.id = ANY($1) AND p.user_id = $2`,
          [order, userId]
        );

        if (exercises.length !== order.length) {
          const foundIds = new Set(exercises.map(e => e.id));
          const missing = order.filter(id => !foundIds.has(id));
          return toolResponse({ error: `Some exercise IDs not found: ${missing.join(", ")}` }, true);
        }

        // Verify all exercises are from the same day
        const dayIds = new Set(exercises.map(e => e.day_id));
        if (dayIds.size > 1) {
          return toolResponse({ error: "All exercises must be from the same day. Use move_exercise for cross-day moves." }, true);
        }

        // Update sort_order for each exercise based on position in order array
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          for (let i = 0; i < order.length; i++) {
            await client.query(
              "UPDATE program_day_exercises SET sort_order = $1 WHERE id = $2",
              [i, order[i]]
            );
          }

          await client.query("COMMIT");

          return toolResponse({
            reordered: true,
            count: order.length,
            day_id: exercises[0].day_id,
          });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      return toolResponse({ error: "Unknown action" }, true);
    })
  );
}
