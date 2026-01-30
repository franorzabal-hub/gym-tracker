import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";

const exerciseEntrySchema = z.object({
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
  superset_group: z.number().int().optional(),
  muscle_group: z.string().optional(),
  equipment: z.string().optional(),
  set_notes: z.union([z.string(), z.array(z.string())]).optional(),
});

type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;

async function logSingleExercise(sessionId: number, entry: ExerciseEntry) {
  const { exercise, sets, reps, weight, rpe, set_type, notes, rest_seconds, superset_group, muscle_group, equipment, set_notes } = entry;

  // Resolve exercise (pass metadata for auto-create or fill)
  const resolved = await resolveExercise(exercise, muscle_group, equipment);

  // Create session_exercise
  const { rows: [se] } = await pool.query(
    `INSERT INTO session_exercises (session_id, exercise_id, sort_order, notes, rest_seconds, superset_group)
     VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM session_exercises WHERE session_id = $1), 0), $3, $4, $5)
     RETURNING id`,
    [sessionId, resolved.id, notes || null, rest_seconds || null, superset_group || null]
  );

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

  // Insert sets
  const loggedSets: Array<{
    set_number: number;
    reps: number;
    weight?: number;
    rpe?: number;
    set_type: string;
    notes?: string;
    set_id: number;
  }> = [];

  for (let i = 0; i < repsArray.length; i++) {
    const setNote = notesArray[i] || null;
    const { rows: [inserted] } = await pool.query(
      `INSERT INTO sets (session_exercise_id, set_number, set_type, reps, weight, rpe, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [se.id, i + 1, set_type, repsArray[i], weight || null, rpe || null, setNote]
    );
    loggedSets.push({
      set_number: i + 1,
      reps: repsArray[i],
      weight: weight || undefined,
      rpe: rpe || undefined,
      set_type,
      notes: setNote || undefined,
      set_id: inserted.id,
    });
  }

  // Check for PRs
  const newPRs = await checkPRs(
    resolved.id,
    loggedSets.map((s) => ({
      reps: s.reps,
      weight: s.weight ?? null,
      set_id: s.set_id,
    }))
  );

  return {
    exercise_name: resolved.name,
    is_new_exercise: resolved.isNew,
    logged_sets: loggedSets.map(({ set_id, ...rest }) => rest),
    new_prs: newPRs.length > 0 ? newPRs : undefined,
  };
}

export function registerLogExerciseTool(server: McpServer) {
  server.tool(
    "log_exercise",
    `Log sets of an exercise to the current workout session.
The user might say things like "hice peso muerto 100kg 5x5" or "did 3 sets of pull-ups: 10, 8, 6".
If no session is active, one will be created automatically.
If the exercise doesn't exist, it will be created automatically.

Single exercise mode:
- exercise: name or alias of the exercise
- sets: number of sets (used when all sets have same reps)
- reps: single number (same for all sets) or array of numbers (one per set, e.g. [10, 8, 6])
- weight: weight in kg (optional for bodyweight exercises)
- rpe: rate of perceived exertion 1-10 (optional)
- set_type: "warmup", "working" (default), "drop", or "failure"
- notes: optional notes
- rest_seconds: optional rest time in seconds between sets
- superset_group: optional integer to group exercises into supersets (same number = same superset)
- muscle_group: optional muscle group for the exercise (used to fill metadata if missing)
- equipment: optional equipment type (used to fill metadata if missing)
- set_notes: optional notes per set. A single string applies to all sets, or an array of strings (one per set).

Bulk mode:
- exercises: array of exercise entries (each with the same fields as above). Logs multiple exercises in one call.

Returns the logged sets and any new personal records achieved.`,
    {
      exercise: z.string().optional(),
      sets: z.number().int().min(1).default(1),
      reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1))]).optional(),
      weight: z.number().optional(),
      rpe: z.number().min(1).max(10).optional(),
      set_type: z
        .enum(["warmup", "working", "drop", "failure"])
        .default("working"),
      notes: z.string().optional(),
      rest_seconds: z.number().int().optional(),
      superset_group: z.number().int().optional(),
      muscle_group: z.string().optional(),
      equipment: z.string().optional(),
      set_notes: z.union([z.string(), z.array(z.string())]).optional(),
      exercises: z.array(exerciseEntrySchema).optional(),
    },
    async (params) => {
      // Get or create active session
      let sessionRes = await pool.query(
        "SELECT id FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
      );
      if (sessionRes.rows.length === 0) {
        sessionRes = await pool.query(
          "INSERT INTO sessions DEFAULT VALUES RETURNING id"
        );
      }
      const sessionId = sessionRes.rows[0].id;

      // Bulk mode
      if (params.exercises && params.exercises.length > 0) {
        const results = [];
        for (const entry of params.exercises) {
          results.push(await logSingleExercise(sessionId, entry));
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                session_id: sessionId,
                exercises_logged: results,
              }),
            },
          ],
        };
      }

      // Single mode
      if (!params.exercise) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide 'exercise' (single mode) or 'exercises' (bulk mode)" }) }],
          isError: true,
        };
      }
      if (!params.reps) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Reps required" }) }],
          isError: true,
        };
      }

      const result = await logSingleExercise(sessionId, {
        exercise: params.exercise,
        sets: params.sets,
        reps: params.reps,
        weight: params.weight,
        rpe: params.rpe,
        set_type: params.set_type,
        notes: params.notes,
        rest_seconds: params.rest_seconds,
        superset_group: params.superset_group,
        muscle_group: params.muscle_group,
        equipment: params.equipment,
        set_notes: params.set_notes,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...result,
              session_id: sessionId,
            }),
          },
        ],
      };
    }
  );
}
