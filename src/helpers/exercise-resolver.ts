import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";

export interface ResolvedExercise {
  id: number;
  name: string;
  isNew: boolean;
  exerciseType?: string;
}

export async function findExercise(input: string): Promise<ResolvedExercise | null> {
  const normalized = input.trim().toLowerCase();
  const userId = getUserId();

  // 1. Exact name match (user-owned first, then global)
  const exact = await pool.query(
    `SELECT id, name, exercise_type FROM exercises
     WHERE LOWER(name) = $1 AND (user_id IS NULL OR user_id = $2)
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (exact.rows.length > 0) {
    return { id: exact.rows[0].id, name: exact.rows[0].name, isNew: false, exerciseType: exact.rows[0].exercise_type };
  }

  // 2. Alias match
  const alias = await pool.query(
    `SELECT e.id, e.name, e.exercise_type FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ORDER BY e.user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (alias.rows.length > 0) {
    return { id: alias.rows[0].id, name: alias.rows[0].name, isNew: false, exerciseType: alias.rows[0].exercise_type };
  }

  // 3. Partial match (ILIKE)
  const partial = await pool.query(
    `SELECT id, name, exercise_type FROM (
       SELECT e.id, e.name, e.exercise_type, e.user_id FROM exercises e
       WHERE e.name ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
       UNION
       SELECT e.id, e.name, e.exercise_type, e.user_id FROM exercise_aliases a
       JOIN exercises e ON e.id = a.exercise_id
       WHERE a.alias ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ) sub
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [`%${normalized}%`, userId]
  );
  if (partial.rows.length > 0) {
    return { id: partial.rows[0].id, name: partial.rows[0].name, isNew: false, exerciseType: partial.rows[0].exercise_type };
  }

  return null;
}

export async function resolveExercise(
  input: string,
  muscleGroup?: string,
  equipment?: string,
  repType?: string,
  exerciseType?: string
): Promise<ResolvedExercise> {
  const normalized = input.trim().toLowerCase();
  const userId = getUserId();

  // 1. Exact name match (user-owned first, then global)
  const exact = await pool.query(
    `SELECT id, name, muscle_group, equipment, rep_type, exercise_type, user_id FROM exercises
     WHERE LOWER(name) = $1 AND (user_id IS NULL OR user_id = $2)
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (exact.rows.length > 0) {
    await fillMetadataIfMissing(exact.rows[0], muscleGroup, equipment, repType, exerciseType);
    return { id: exact.rows[0].id, name: exact.rows[0].name, isNew: false, exerciseType: exact.rows[0].exercise_type };
  }

  // 2. Alias match
  const alias = await pool.query(
    `SELECT e.id, e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ORDER BY e.user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (alias.rows.length > 0) {
    await fillMetadataIfMissing(alias.rows[0], muscleGroup, equipment, repType, exerciseType);
    return { id: alias.rows[0].id, name: alias.rows[0].name, isNew: false, exerciseType: alias.rows[0].exercise_type };
  }

  // 3. Partial match (ILIKE)
  const partial = await pool.query(
    `SELECT id, name, muscle_group, equipment, rep_type, exercise_type, user_id FROM (
       SELECT e.id, e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercises e
       WHERE e.name ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
       UNION
       SELECT e.id, e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercise_aliases a
       JOIN exercises e ON e.id = a.exercise_id
       WHERE a.alias ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ) sub
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [`%${normalized}%`, userId]
  );
  if (partial.rows.length > 0) {
    await fillMetadataIfMissing(partial.rows[0], muscleGroup, equipment, repType, exerciseType);
    return {
      id: partial.rows[0].id,
      name: partial.rows[0].name,
      isNew: false,
      exerciseType: partial.rows[0].exercise_type,
    };
  }

  // 4. Auto-create (user-owned)
  const created = await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment, rep_type, exercise_type, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, exercise_type`,
    [input.trim(), muscleGroup || null, equipment || null, repType || 'reps', exerciseType || 'strength', userId]
  );
  return { id: created.rows[0].id, name: created.rows[0].name, isNew: true, exerciseType: created.rows[0].exercise_type };
}

async function fillMetadataIfMissing(
  row: { id: number; muscle_group: string | null; equipment: string | null; rep_type: string | null; exercise_type: string | null; user_id: number | null },
  muscleGroup?: string,
  equipment?: string,
  repType?: string,
  exerciseType?: string
): Promise<void> {
  const userId = getUserId();

  // Only update user-owned exercises (never modify global exercises)
  if (row.user_id !== userId) return;

  const updates: string[] = [];
  const params: any[] = [];

  if (!row.muscle_group && muscleGroup) {
    params.push(muscleGroup);
    updates.push(`muscle_group = $${params.length}`);
  }
  if (!row.equipment && equipment) {
    params.push(equipment);
    updates.push(`equipment = $${params.length}`);
  }
  if (row.rep_type === 'reps' && repType && repType !== 'reps') {
    params.push(repType);
    updates.push(`rep_type = $${params.length}`);
  }
  if (row.exercise_type === 'strength' && exerciseType && exerciseType !== 'strength') {
    params.push(exerciseType);
    updates.push(`exercise_type = $${params.length}`);
  }

  if (updates.length > 0) {
    params.push(row.id);
    await pool.query(
      `UPDATE exercises SET ${updates.join(", ")} WHERE id = $${params.length} AND user_id = $${params.length + 1}`,
      [...params, userId]
    );
  }
}

export async function searchExercises(
  query?: string,
  muscleGroup?: string
): Promise<Array<{ id: number; name: string; muscle_group: string; equipment: string; rep_type: string; exercise_type: string; aliases: string[] }>> {
  const userId = getUserId();
  let sql = `
    SELECT e.id, e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type,
      COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}') as aliases
    FROM exercises e
    LEFT JOIN exercise_aliases a ON a.exercise_id = e.id
  `;
  const params: any[] = [userId];
  const conditions: string[] = ["(e.user_id IS NULL OR e.user_id = $1)"];

  if (query) {
    params.push(`%${query}%`);
    conditions.push(
      `(e.name ILIKE $${params.length} OR a.alias ILIKE $${params.length})`
    );
  }
  if (muscleGroup) {
    params.push(muscleGroup.toLowerCase());
    conditions.push(`LOWER(e.muscle_group) = $${params.length}`);
  }

  sql += " WHERE " + conditions.join(" AND ");
  sql += " GROUP BY e.id ORDER BY e.user_id NULLS LAST, e.name";

  const { rows } = await pool.query(sql, params);
  return rows;
}
