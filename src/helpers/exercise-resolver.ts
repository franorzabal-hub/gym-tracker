import pool from "../db/connection.js";

export interface ResolvedExercise {
  id: number;
  name: string;
  isNew: boolean;
}

export async function findExercise(input: string): Promise<ResolvedExercise | null> {
  const normalized = input.trim().toLowerCase();

  // 1. Exact name match
  const exact = await pool.query(
    "SELECT id, name FROM exercises WHERE LOWER(name) = $1",
    [normalized]
  );
  if (exact.rows.length > 0) {
    return { id: exact.rows[0].id, name: exact.rows[0].name, isNew: false };
  }

  // 2. Alias match
  const alias = await pool.query(
    `SELECT e.id, e.name FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1`,
    [normalized]
  );
  if (alias.rows.length > 0) {
    return { id: alias.rows[0].id, name: alias.rows[0].name, isNew: false };
  }

  // 3. Partial match (ILIKE)
  const partial = await pool.query(
    `SELECT id, name FROM exercises WHERE name ILIKE $1
     UNION
     SELECT e.id, e.name FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE a.alias ILIKE $1
     LIMIT 1`,
    [`%${normalized}%`]
  );
  if (partial.rows.length > 0) {
    return { id: partial.rows[0].id, name: partial.rows[0].name, isNew: false };
  }

  return null;
}

export async function resolveExercise(
  input: string,
  muscleGroup?: string,
  equipment?: string
): Promise<ResolvedExercise> {
  const normalized = input.trim().toLowerCase();

  // 1. Exact name match
  const exact = await pool.query(
    "SELECT id, name, muscle_group, equipment FROM exercises WHERE LOWER(name) = $1",
    [normalized]
  );
  if (exact.rows.length > 0) {
    await fillMetadataIfMissing(exact.rows[0], muscleGroup, equipment);
    return { id: exact.rows[0].id, name: exact.rows[0].name, isNew: false };
  }

  // 2. Alias match
  const alias = await pool.query(
    `SELECT e.id, e.name, e.muscle_group, e.equipment FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1`,
    [normalized]
  );
  if (alias.rows.length > 0) {
    await fillMetadataIfMissing(alias.rows[0], muscleGroup, equipment);
    return { id: alias.rows[0].id, name: alias.rows[0].name, isNew: false };
  }

  // 3. Partial match (ILIKE)
  const partial = await pool.query(
    `SELECT id, name, muscle_group, equipment FROM exercises WHERE name ILIKE $1
     UNION
     SELECT e.id, e.name, e.muscle_group, e.equipment FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE a.alias ILIKE $1
     LIMIT 1`,
    [`%${normalized}%`]
  );
  if (partial.rows.length > 0) {
    await fillMetadataIfMissing(partial.rows[0], muscleGroup, equipment);
    return {
      id: partial.rows[0].id,
      name: partial.rows[0].name,
      isNew: false,
    };
  }

  // 4. Auto-create
  const created = await pool.query(
    `INSERT INTO exercises (name, muscle_group, equipment) VALUES ($1, $2, $3) RETURNING id, name`,
    [input.trim(), muscleGroup || null, equipment || null]
  );
  return { id: created.rows[0].id, name: created.rows[0].name, isNew: true };
}

async function fillMetadataIfMissing(
  row: { id: number; muscle_group: string | null; equipment: string | null },
  muscleGroup?: string,
  equipment?: string
): Promise<void> {
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

  if (updates.length > 0) {
    params.push(row.id);
    await pool.query(
      `UPDATE exercises SET ${updates.join(", ")} WHERE id = $${params.length}`,
      params
    );
  }
}

export async function searchExercises(
  query?: string,
  muscleGroup?: string
): Promise<Array<{ id: number; name: string; muscle_group: string; equipment: string; aliases: string[] }>> {
  let sql = `
    SELECT e.id, e.name, e.muscle_group, e.equipment,
      COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}') as aliases
    FROM exercises e
    LEFT JOIN exercise_aliases a ON a.exercise_id = e.id
  `;
  const params: string[] = [];
  const conditions: string[] = [];

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

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " GROUP BY e.id ORDER BY e.name";

  const { rows } = await pool.query(sql, params);
  return rows;
}
