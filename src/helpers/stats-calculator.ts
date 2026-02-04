import { PoolClient } from "pg";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import type { ExerciseType, SetType, PRCheck } from "../db/types.js";

// Re-export PRCheck from db/types for backwards compatibility
export type { PRCheck } from "../db/types.js";

/**
 * Estimates one-rep max using the Epley formula: weight × (1 + reps/30).
 * Returns null for invalid inputs. Returns weight directly for single-rep sets.
 * Result is rounded to one decimal place.
 */
export function estimateE1RM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function calculateVolume(
  sets: Array<{ weight?: number | null; reps: number; set_type?: SetType }>
): number {
  return sets
    .filter((s) => s.set_type !== "warmup")
    .reduce((sum, s) => sum + (s.weight || 0) * s.reps, 0);
}

/**
 * Checks and records personal records for a set of new lifts.
 * Only applies to strength exercises. PR types checked:
 *   - max_weight: heaviest single lift
 *   - max_reps_at_{weight}: most reps at a specific weight
 *   - estimated_1rm: highest estimated one-rep max (Epley formula)
 *
 * Uses a PostgreSQL advisory lock (keyed on user_id + exercise_id) to prevent
 * duplicate PRs from concurrent requests logging the same exercise.
 * When called within an existing transaction (externalClient), piggybacks
 * on that transaction's lock scope; otherwise opens its own.
 *
 * @param achievedAt - Optional timestamp for when the PR was achieved.
 *                     Used for backdated sessions. Defaults to NOW().
 */
export async function checkPRs(
  exerciseId: number,
  newSets: Array<{ reps: number; weight?: number | null; set_id: number }>,
  exerciseType?: ExerciseType | string,
  externalClient?: PoolClient,
  achievedAt?: Date
): Promise<PRCheck[]> {
  if (exerciseType && exerciseType !== 'strength') {
    return [];
  }

  const userId = getUserId();

  const runInTransaction = async (client: PoolClient): Promise<PRCheck[]> => {
    // Advisory lock: prevents concurrent PR checks for the same user+exercise
    // from creating duplicate PR history entries (e.g., two bulk-logged sets
    // racing to claim the same max_weight record)
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [userId, exerciseId]);

    // Pre-load all current PRs in one query
    const { rows: currentPRs } = await client.query(
      `SELECT record_type, value FROM personal_records WHERE user_id = $1 AND exercise_id = $2`,
      [userId, exerciseId]
    );
    const prMap = new Map(currentPRs.map((r) => [r.record_type, Number(r.value)]));

    const prs: PRCheck[] = [];
    const upserts: Array<{ type: string; value: number; setId: number }> = [];

    for (const set of newSets) {
      if (!set.weight || set.weight <= 0) continue;

      // Check max weight
      const currentMax = prMap.get("max_weight") || 0;
      if (set.weight > currentMax) {
        prMap.set("max_weight", set.weight);
        upserts.push({ type: "max_weight", value: set.weight, setId: set.set_id });
        prs.push({
          record_type: "max_weight",
          value: set.weight,
          previous: currentMax || undefined,
        });
      }

      // Check max reps at this weight
      const repsKey = `max_reps_at_${set.weight}`;
      const currentMaxReps = prMap.get(repsKey) || 0;
      if (set.reps > currentMaxReps) {
        prMap.set(repsKey, set.reps);
        upserts.push({ type: repsKey, value: set.reps, setId: set.set_id });
        prs.push({
          record_type: repsKey,
          value: set.reps,
          previous: currentMaxReps || undefined,
        });
      }

      // Check estimated 1RM
      const e1rm = estimateE1RM(set.weight, set.reps);
      if (e1rm !== null) {
        const currentE1rm = prMap.get("estimated_1rm") || 0;
        if (e1rm > currentE1rm) {
          prMap.set("estimated_1rm", e1rm);
          upserts.push({ type: "estimated_1rm", value: e1rm, setId: set.set_id });
          prs.push({
            record_type: "estimated_1rm",
            value: e1rm,
            previous: currentE1rm || undefined,
          });
        }
      }
    }

    // Batch upsert all new PRs
    for (const { type, value, setId } of upserts) {
      await upsertPR(userId, exerciseId, type, value, setId, client, achievedAt);
    }

    // Deduplicate by record_type (keep only the best per type)
    const seen = new Map<string, PRCheck>();
    for (const pr of prs) {
      const existing = seen.get(pr.record_type);
      if (!existing || pr.value > existing.value) {
        seen.set(pr.record_type, pr);
      }
    }
    return Array.from(seen.values());
  };

  if (externalClient) {
    return runInTransaction(externalClient);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runInTransaction(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertPR(
  userId: number,
  exerciseId: number,
  recordType: string,
  value: number,
  setId: number,
  client: PoolClient,
  achievedAt?: Date
) {
  const timestamp = achievedAt ?? new Date();
  await client.query(
    `INSERT INTO personal_records (user_id, exercise_id, record_type, value, achieved_at, set_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, exercise_id, record_type) DO UPDATE
     SET value = $4, achieved_at = $5, set_id = $6
     WHERE personal_records.value < $4`,
    [userId, exerciseId, recordType, value, timestamp, setId]
  );

  // Log to PR history for timeline tracking, prevent duplicates within same minute
  await client.query(
    `INSERT INTO pr_history (user_id, exercise_id, record_type, value, achieved_at, set_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM pr_history
       WHERE user_id = $1 AND exercise_id = $2 AND record_type = $3 AND value = $4
         AND achieved_at >= date_trunc('minute', $5::timestamptz)
     )`,
    [userId, exerciseId, recordType, value, timestamp, setId]
  );
}
