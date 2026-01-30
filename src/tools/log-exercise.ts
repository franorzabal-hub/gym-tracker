import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";

export function registerLogExerciseTool(server: McpServer) {
  server.tool(
    "log_exercise",
    `Log sets of an exercise to the current workout session.
The user might say things like "hice peso muerto 100kg 5x5" or "did 3 sets of pull-ups: 10, 8, 6".
If no session is active, one will be created automatically.
If the exercise doesn't exist, it will be created automatically.

Parameters:
- exercise: name or alias of the exercise
- sets: number of sets (used when all sets have same reps)
- reps: single number (same for all sets) or array of numbers (one per set, e.g. [10, 8, 6])
- weight: weight in kg (optional for bodyweight exercises)
- rpe: rate of perceived exertion 1-10 (optional)
- set_type: "warmup", "working" (default), "drop", or "failure"
- notes: optional notes

Returns the logged sets and any new personal records achieved.`,
    {
      exercise: z.string(),
      sets: z.number().int().min(1).default(1),
      reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1))]),
      weight: z.number().optional(),
      rpe: z.number().min(1).max(10).optional(),
      set_type: z
        .enum(["warmup", "working", "drop", "failure"])
        .default("working"),
      notes: z.string().optional(),
    },
    async ({ exercise, sets, reps, weight, rpe, set_type, notes }) => {
      // Resolve exercise
      const resolved = await resolveExercise(exercise);

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

      // Create session_exercise
      const { rows: [se] } = await pool.query(
        `INSERT INTO session_exercises (session_id, exercise_id, sort_order, notes)
         VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM session_exercises WHERE session_id = $1), 0), $3)
         RETURNING id`,
        [sessionId, resolved.id, notes || null]
      );

      // Determine reps per set
      const repsArray = Array.isArray(reps)
        ? reps
        : Array(sets).fill(reps);

      // Insert sets
      const loggedSets: Array<{
        set_number: number;
        reps: number;
        weight?: number;
        rpe?: number;
        set_type: string;
        set_id: number;
      }> = [];

      for (let i = 0; i < repsArray.length; i++) {
        const { rows: [inserted] } = await pool.query(
          `INSERT INTO sets (session_exercise_id, set_number, set_type, reps, weight, rpe)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [se.id, i + 1, set_type, repsArray[i], weight || null, rpe || null]
        );
        loggedSets.push({
          set_number: i + 1,
          reps: repsArray[i],
          weight: weight || undefined,
          rpe: rpe || undefined,
          set_type,
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
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              exercise_name: resolved.name,
              is_new_exercise: resolved.isNew,
              session_id: sessionId,
              logged_sets: loggedSets.map(({ set_id, ...rest }) => rest),
              new_prs: newPRs.length > 0 ? newPRs : undefined,
            }),
          },
        ],
      };
    }
  );
}
