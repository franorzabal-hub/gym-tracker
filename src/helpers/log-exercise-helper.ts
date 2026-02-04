import { z } from "zod";
import { PoolClient } from "pg";
import pool from "../db/connection.js";
import { resolveExercise } from "./exercise-resolver.js";
import { checkPRs } from "./stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { type Locale, DEFAULT_LOCALE } from "./profile-helpers.js";

export const exerciseEntrySchema = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1).default(1),
  reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1))]),
  weight: z.number().optional(),
  rpe: z.number().min(1).max(10).optional(),
  set_type: z
    .enum(["warmup", "working", "drop", "failure"])
    .default("working"),
  notes: z.string().optional(),
  rest_seconds: z.number().int().optional(),
  group_id: z.number().int().optional(),
  muscle_group: z.string().optional(),
  equipment: z.string().optional(),
  set_notes: z.union([z.string(), z.array(z.string())]).optional(),
  drop_percent: z.number().min(1).max(50).optional(),
  rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
  exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),
});

export type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;

export async function logSingleExercise(sessionId: number, entry: ExerciseEntry, client?: PoolClient, sessionValidated: boolean = true, locale: Locale = DEFAULT_LOCALE, achievedAt?: Date) {
  const { exercise, sets, reps, weight, rpe, set_type, notes, rest_seconds, group_id, muscle_group, equipment, set_notes, drop_percent, rep_type, exercise_type } = entry;
  const q = client || pool;

  // Resolve exercise (pass metadata for auto-create or fill)
  const resolved = await resolveExercise(exercise, muscle_group, equipment, rep_type, exercise_type, client, locale);

  // Check if session_exercise already exists for this exercise in this session
  const userId = getUserId();
  const { rows: existingRows } = await q.query(
    `SELECT se.id, COALESCE(MAX(s.set_number), 0) AS max_set_number
     FROM session_exercises se
     JOIN sessions sess ON sess.id = se.session_id
     LEFT JOIN sets s ON s.session_exercise_id = se.id
     WHERE se.session_id = $1 AND se.exercise_id = $2 AND sess.user_id = $3
     GROUP BY se.id
     LIMIT 1`,
    [sessionId, resolved.id, userId]
  );

  let se: { id: number };
  let startSetNumber: number;

  if (existingRows.length > 0) {
    // Reuse existing session_exercise
    se = { id: existingRows[0].id };
    startSetNumber = parseInt(existingRows[0].max_set_number, 10) || 0;

    // Update notes/rest_seconds/group_id if currently null and new values provided
    const updates: string[] = [];
    const updateValues: unknown[] = [];
    let paramIdx = 1;

    if (notes) {
      updates.push(`notes = COALESCE(notes, $${paramIdx})`);
      updateValues.push(notes);
      paramIdx++;
    }
    if (rest_seconds != null) {
      updates.push(`rest_seconds = COALESCE(rest_seconds, $${paramIdx})`);
      updateValues.push(rest_seconds);
      paramIdx++;
    }
    if (group_id != null) {
      updates.push(`group_id = COALESCE(group_id, $${paramIdx})`);
      updateValues.push(group_id);
      paramIdx++;
    }

    if (updates.length > 0) {
      updateValues.push(se.id);
      await q.query(
        `UPDATE session_exercises SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
        updateValues
      );
    }
  } else {
    // Create new session_exercise
    const { rows: [newSe] } = await q.query(
      `INSERT INTO session_exercises (session_id, exercise_id, sort_order, notes, rest_seconds, group_id)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM session_exercises WHERE session_id = $1), 0), $3, $4, $5)
       RETURNING id`,
      [sessionId, resolved.id, notes || null, rest_seconds ?? null, group_id ?? null]
    );
    se = newSe;
    startSetNumber = 0;
  }

  // Determine reps per set
  const repsArray = Array.isArray(reps)
    ? reps
    : Array(sets).fill(reps);

  // Resolve set_notes into an array
  const notesArray: (string | null)[] = set_notes
    ? typeof set_notes === "string"
      ? Array(repsArray.length).fill(set_notes)
      : set_notes.map((n) => n || null)
    : Array(repsArray.length).fill(null);

  // Prepare batch data for sets
  const setNumbers: number[] = [];
  const setReps: number[] = [];
  const setWeights: (number | null)[] = [];
  const setRPEs: (number | null)[] = [];
  const setNotes: (string | null)[] = [];

  for (let i = 0; i < repsArray.length; i++) {
    setNumbers.push(startSetNumber + i + 1);
    setReps.push(repsArray[i]);
    setRPEs.push(rpe || null);
    setNotes.push(notesArray[i] || null);

    // Calculate weight for drop sets
    let setWeight = weight || null;
    if (set_type === "drop" && weight && drop_percent) {
      setWeight = Math.max(0, Math.round((weight * (1 - (i * drop_percent / 100))) * 10) / 10);
    }
    setWeights.push(setWeight);
  }

  // Batch INSERT all sets at once
  const { rows: insertedSets } = await q.query(
    `INSERT INTO sets (session_exercise_id, set_number, set_type, reps, weight, rpe, notes)
     SELECT $1, unnest($2::int[]), $3, unnest($4::int[]), unnest($5::real[]), unnest($6::real[]), unnest($7::text[])
     RETURNING id, set_number, reps, weight, rpe, notes`,
    [se.id, setNumbers, set_type, setReps, setWeights, setRPEs, setNotes]
  );

  const loggedSets = insertedSets.map((row: { id: number; set_number: number; reps: number; weight: number | null; rpe: number | null; notes: string | null }) => ({
    set_number: row.set_number,
    reps: row.reps,
    weight: row.weight ?? undefined,
    rpe: row.rpe ?? undefined,
    set_type,
    notes: row.notes ?? undefined,
    set_id: row.id,
  }));

  // Check for PRs (only if session is validated)
  const newPRs = sessionValidated
    ? await checkPRs(
        resolved.id,
        loggedSets.map((s) => ({
          reps: s.reps,
          weight: s.weight ?? null,
          set_id: s.set_id,
        })),
        resolved.exerciseType,
        client,
        achievedAt
      )
    : [];

  return {
    exercise_name: resolved.displayName,
    is_new_exercise: resolved.isNew,
    logged_sets: loggedSets,
    new_prs: newPRs.length > 0 ? newPRs : undefined,
    rest_seconds: rest_seconds || undefined,
    rest_reminder: rest_seconds ? `Rest ${rest_seconds}s before next set` : undefined,
  };
}
