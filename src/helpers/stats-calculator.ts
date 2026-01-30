import pool from "../db/connection.js";

export function estimateE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  // Epley formula
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function calculateVolume(
  sets: Array<{ weight?: number | null; reps: number; set_type?: string }>
): number {
  return sets
    .filter((s) => s.set_type !== "warmup")
    .reduce((sum, s) => sum + (s.weight || 0) * s.reps, 0);
}

export interface PRCheck {
  record_type: string;
  value: number;
  previous?: number;
}

export async function checkPRs(
  exerciseId: number,
  newSets: Array<{ reps: number; weight?: number | null; set_id: number }>
): Promise<PRCheck[]> {
  // Pre-load all current PRs in one query
  const { rows: currentPRs } = await pool.query(
    `SELECT record_type, value FROM personal_records WHERE exercise_id = $1`,
    [exerciseId]
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
    }

    // Check estimated 1RM
    const e1rm = estimateE1RM(set.weight, set.reps);
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

  // Batch upsert all new PRs
  for (const { type, value, setId } of upserts) {
    await upsertPR(exerciseId, type, value, setId);
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
}

async function upsertPR(
  exerciseId: number,
  recordType: string,
  value: number,
  setId: number
) {
  await pool.query(
    `INSERT INTO personal_records (exercise_id, record_type, value, achieved_at, set_id)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (exercise_id, record_type) DO UPDATE
     SET value = $3, achieved_at = NOW(), set_id = $4
     WHERE personal_records.value < $3`,
    [exerciseId, recordType, value, setId]
  );
}
