import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PoolClient } from "pg";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam } from "../helpers/parse-helpers.js";
import { toolResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

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
  drop_percent: z.number().min(1).max(50).optional(),
  rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
  exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),
});

type ExerciseEntry = z.infer<typeof exerciseEntrySchema>;

async function logSingleExercise(sessionId: number, entry: ExerciseEntry, client?: PoolClient) {
  const { exercise, sets, reps, weight, rpe, set_type, notes, rest_seconds, superset_group, muscle_group, equipment, set_notes, drop_percent, rep_type, exercise_type } = entry;
  const q = client || pool;

  // Resolve exercise (pass metadata for auto-create or fill)
  const resolved = await resolveExercise(exercise, muscle_group, equipment, rep_type, exercise_type, client);

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
    startSetNumber = parseInt(existingRows[0].max_set_number, 10);

    // Update notes/rest_seconds/superset_group if currently null and new values provided
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
    if (superset_group != null) {
      updates.push(`superset_group = COALESCE(superset_group, $${paramIdx})`);
      updateValues.push(superset_group);
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
      `INSERT INTO session_exercises (session_id, exercise_id, sort_order, notes, rest_seconds, superset_group)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM session_exercises WHERE session_id = $1), 0), $3, $4, $5)
       RETURNING id`,
      [sessionId, resolved.id, notes || null, rest_seconds ?? null, superset_group ?? null]
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
    // Calculate weight for drop sets
    let setWeight = weight || null;
    if (set_type === 'drop' && weight && drop_percent) {
      setWeight = Math.max(0, Math.round((weight * (1 - (i * drop_percent / 100))) * 10) / 10);
    }
    const { rows: [inserted] } = await q.query(
      `INSERT INTO sets (session_exercise_id, set_number, set_type, reps, weight, rpe, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [se.id, startSetNumber + i + 1, set_type, repsArray[i], setWeight, rpe || null, setNote]
    );
    loggedSets.push({
      set_number: startSetNumber + i + 1,
      reps: repsArray[i],
      weight: setWeight || undefined,
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
    })),
    resolved.exerciseType,
    client
  );

  return {
    exercise_name: resolved.name,
    is_new_exercise: resolved.isNew,
    logged_sets: loggedSets,
    new_prs: newPRs.length > 0 ? newPRs : undefined,
    rest_seconds: rest_seconds || undefined,
    rest_reminder: rest_seconds ? `Rest ${rest_seconds}s before next set` : undefined,
  };
}

export function registerLogExerciseTool(server: McpServer) {
  registerAppToolWithMeta(server, "log_exercise", {
    title: "Log Exercise",
    description: `Log sets of an exercise to the current workout session.
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
- drop_percent: optional percentage to decrease weight per set for drop sets (1-50). When set_type is "drop" and drop_percent is provided, weight automatically decreases each set. E.g. weight=100, drop_percent=10 produces sets at 100, 90, 80, etc.

Bulk mode:
- exercises: array of exercise entries (each with the same fields as above). Logs multiple exercises in one call.

Returns the logged sets and any new personal records achieved.`,
    inputSchema: {
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
      drop_percent: z.number().min(1).max(50).optional(),
      rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
      exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),
      exercises: z.union([z.array(exerciseEntrySchema), z.string()]).optional(),
      minimal_response: z.boolean().optional().describe("If true, return only success status and new PRs, without echoing back all logged data"),
    },
    annotations: { readOnlyHint: false },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/session.html" },
    },
  }, async (params) => {
      const userId = getUserId();

      // Get or create active session
      let sessionRes = await pool.query(
        "SELECT id FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
        [userId]
      );
      if (sessionRes.rows.length === 0) {
        sessionRes = await pool.query(
          "INSERT INTO sessions (user_id) VALUES ($1) RETURNING id",
          [userId]
        );
      }
      const sessionId = sessionRes.rows[0].id;

      // Bulk mode — some MCP clients serialize nested arrays as JSON strings
      const exercisesList = parseJsonParam<ExerciseEntry[]>(params.exercises);
      if (exercisesList && Array.isArray(exercisesList) && exercisesList.length > 0) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const results = [];
          for (const entry of exercisesList) {
            results.push(await logSingleExercise(sessionId, entry, client));
          }
          await client.query("COMMIT");

          if (params.minimal_response) {
            const allPRs = results.flatMap(r => r.new_prs || []);
            return toolResponse({
                    success: true,
                    exercises_logged: results.length,
                    new_prs: allPRs.length > 0 ? allPRs : undefined,
                  });
          }

          return toolResponse({
                  session_id: sessionId,
                  exercises_logged: results,
                });
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      // Single mode
      if (!params.exercise) {
        return toolResponse({ error: "Provide 'exercise' (single mode) or 'exercises' (bulk mode)" }, true);
      }
      if (!params.reps) {
        return toolResponse({ error: "Reps required" }, true);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
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
          drop_percent: params.drop_percent,
          rep_type: params.rep_type,
          exercise_type: params.exercise_type,
        }, client);
        await client.query("COMMIT");

        if (params.minimal_response) {
          return toolResponse({
                  success: true,
                  exercises_logged: 1,
                  new_prs: result.new_prs || undefined,
                });
        }

        return toolResponse({
                ...result,
                session_id: sessionId,
              });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
