import { PoolClient } from "pg";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { escapeIlike } from "./parse-helpers.js";
import { getLocalizedName, type Locale, DEFAULT_LOCALE } from "./profile-helpers.js";
import type { ExerciseType } from "../db/types.js";

const q = (client?: PoolClient) => client || pool;

export interface ResolvedExercise {
  id: number;
  name: string;
  displayName: string;
  isNew: boolean;
  exerciseType?: ExerciseType;
}

/**
 * Resolves an exercise name through a 3-step lookup chain:
 *   1. Exact name match (case-insensitive, user-owned first, then global)
 *   2. Alias match (via exercise_aliases table)
 *   3. Partial match (ILIKE on both names and aliases)
 * Returns null if no match is found — never auto-creates.
 *
 * @param input - Exercise name or alias to search
 * @param client - Optional PoolClient for transactions
 * @param locale - User's locale for displayName (defaults to 'en')
 */
export async function findExercise(input: string, client?: PoolClient, locale: Locale = DEFAULT_LOCALE): Promise<ResolvedExercise | null> {
  const normalized = input.trim().toLowerCase();
  const userId = getUserId();

  // 1. Exact name match (user-owned first, then global)
  const exact = await q(client).query(
    `SELECT id, name, names, exercise_type FROM exercises
     WHERE LOWER(name) = $1 AND (user_id IS NULL OR user_id = $2)
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (exact.rows.length > 0) {
    const row = exact.rows[0];
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  // 2. Alias match
  const alias = await q(client).query(
    `SELECT e.id, e.name, e.names, e.exercise_type FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ORDER BY e.user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (alias.rows.length > 0) {
    const row = alias.rows[0];
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  // 3. Partial match (ILIKE)
  const partial = await q(client).query(
    `SELECT id, name, names, exercise_type FROM (
       SELECT e.id, e.name, e.names, e.exercise_type, e.user_id FROM exercises e
       WHERE e.name ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
       UNION
       SELECT e.id, e.name, e.names, e.exercise_type, e.user_id FROM exercise_aliases a
       JOIN exercises e ON e.id = a.exercise_id
       WHERE a.alias ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ) sub
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [`%${escapeIlike(normalized)}%`, userId]
  );
  if (partial.rows.length > 0) {
    const row = partial.rows[0];
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  return null;
}

/**
 * Resolves an exercise name through a 4-step lookup chain:
 *   1. Exact name match (case-insensitive, user-owned first, then global)
 *   2. Alias match (via exercise_aliases table)
 *   3. Partial match (ILIKE on both names and aliases)
 *   4. Auto-create as a user-owned exercise (defaults: rep_type='reps', exercise_type='strength')
 *
 * Steps 1-3 also backfill missing metadata (muscle_group, equipment, etc.)
 * on user-owned exercises when the caller provides it.
 * On unique-constraint conflict during auto-create (concurrent request race),
 * falls back to a re-lookup instead of throwing.
 *
 * @param locale - User's locale for displayName (defaults to 'en')
 */
export async function resolveExercise(
  input: string,
  muscleGroup?: string,
  equipment?: string,
  repType?: string,
  exerciseType?: string,
  client?: PoolClient,
  locale: Locale = DEFAULT_LOCALE
): Promise<ResolvedExercise> {
  const normalized = input.trim().toLowerCase();
  const userId = getUserId();

  // 1. Exact name match (user-owned first, then global)
  // user_id NULLS LAST: prefer user's custom exercise over the global catalog entry
  const exact = await q(client).query(
    `SELECT id, name, names, muscle_group, equipment, rep_type, exercise_type, user_id FROM exercises
     WHERE LOWER(name) = $1 AND (user_id IS NULL OR user_id = $2)
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (exact.rows.length > 0) {
    const row = exact.rows[0];
    await fillMetadataIfMissing(row, muscleGroup, equipment, repType, exerciseType, client);
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  // 2. Alias match
  const alias = await q(client).query(
    `SELECT e.id, e.name, e.names, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercise_aliases a
     JOIN exercises e ON e.id = a.exercise_id
     WHERE LOWER(a.alias) = $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ORDER BY e.user_id NULLS LAST LIMIT 1`,
    [normalized, userId]
  );
  if (alias.rows.length > 0) {
    const row = alias.rows[0];
    await fillMetadataIfMissing(row, muscleGroup, equipment, repType, exerciseType, client);
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  // 3. Partial match (ILIKE)
  const partial = await q(client).query(
    `SELECT id, name, names, muscle_group, equipment, rep_type, exercise_type, user_id FROM (
       SELECT e.id, e.name, e.names, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercises e
       WHERE e.name ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
       UNION
       SELECT e.id, e.name, e.names, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.user_id FROM exercise_aliases a
       JOIN exercises e ON e.id = a.exercise_id
       WHERE a.alias ILIKE $1 AND (e.user_id IS NULL OR e.user_id = $2)
     ) sub
     ORDER BY user_id NULLS LAST LIMIT 1`,
    [`%${escapeIlike(normalized)}%`, userId]
  );
  if (partial.rows.length > 0) {
    const row = partial.rows[0];
    await fillMetadataIfMissing(row, muscleGroup, equipment, repType, exerciseType, client);
    return {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    };
  }

  // 4. Auto-create (user-owned) - new exercises use user's input as name (no localization needed)
  try {
    const created = await q(client).query(
      `INSERT INTO exercises (name, muscle_group, equipment, rep_type, exercise_type, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, exercise_type`,
      [input.trim(), muscleGroup || null, equipment || null, repType || 'reps', exerciseType || 'strength', userId]
    );
    const createdName = created.rows[0].name;
    return {
      id: created.rows[0].id,
      name: createdName,
      displayName: createdName,
      isNew: true,
      exerciseType: created.rows[0].exercise_type,
    };
  } catch (err: any) {
    if (err.code === '23505') {
      // Concurrent create — look it up again
      const existing = await q(client).query(
        `SELECT id, name, names, exercise_type FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2)
         ORDER BY user_id NULLS LAST LIMIT 1`,
        [input.trim(), userId]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          id: row.id,
          name: row.name,
          displayName: getLocalizedName(row.names, locale, row.name),
          isNew: false,
          exerciseType: row.exercise_type,
        };
      }
    }
    throw err;
  }
}

async function fillMetadataIfMissing(
  row: { id: number; muscle_group: string | null; equipment: string | null; rep_type: string | null; exercise_type: string | null; user_id: number | null },
  muscleGroup?: string,
  equipment?: string,
  repType?: string,
  exerciseType?: string,
  client?: PoolClient
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
    await q(client).query(
      `UPDATE exercises SET ${updates.join(", ")} WHERE id = $${params.length} AND user_id = $${params.length + 1}`,
      [...params, userId]
    );
  }
}

/**
 * Batch resolve multiple exercise names in 1-2 queries instead of 3N.
 * Returns a Map of lowercase exercise name → resolved exercise.
 * Auto-creates missing exercises as user-owned (defaults: rep_type='reps', exercise_type='strength').
 *
 * @param locale - User's locale for displayName (defaults to 'en')
 */
export async function resolveExercisesBatch(
  names: string[],
  userId: number,
  client?: PoolClient,
  locale: Locale = DEFAULT_LOCALE
): Promise<Map<string, ResolvedExercise>> {
  if (names.length === 0) {
    return new Map();
  }

  const conn = client || pool;
  const uniqueNames = [...new Set(names.map(n => n.trim().toLowerCase()))];

  // Single query: exact matches + alias matches (prefer user-owned over global)
  const { rows } = await conn.query(`
    SELECT DISTINCT ON (lookup_name)
      e.id, e.name, e.names, e.exercise_type, lookup_name
    FROM (
      SELECT e.id, e.name, e.names, e.exercise_type, e.user_id, LOWER(e.name) as lookup_name
      FROM exercises e
      WHERE LOWER(e.name) = ANY($1) AND (e.user_id IS NULL OR e.user_id = $2)
      UNION ALL
      SELECT e.id, e.name, e.names, e.exercise_type, e.user_id, LOWER(a.alias) as lookup_name
      FROM exercise_aliases a
      JOIN exercises e ON e.id = a.exercise_id
      WHERE LOWER(a.alias) = ANY($1) AND (e.user_id IS NULL OR e.user_id = $2)
    ) e
    ORDER BY lookup_name, e.user_id NULLS LAST
  `, [uniqueNames, userId]);

  const resolved = new Map<string, ResolvedExercise>();
  for (const row of rows) {
    resolved.set(row.lookup_name, {
      id: row.id,
      name: row.name,
      displayName: getLocalizedName(row.names, locale, row.name),
      isNew: false,
      exerciseType: row.exercise_type,
    });
  }

  // Auto-create missing exercises
  const missing = uniqueNames.filter(n => !resolved.has(n));
  if (missing.length > 0) {
    // Map lowercase name to original casing for INSERT
    const originalNames = new Map<string, string>();
    for (const name of names) {
      const lower = name.trim().toLowerCase();
      if (missing.includes(lower) && !originalNames.has(lower)) {
        originalNames.set(lower, name.trim());
      }
    }

    const namesToInsert = missing.map(lower => originalNames.get(lower) || lower);

    const { rows: created } = await conn.query(`
      INSERT INTO exercises (user_id, name, muscle_group, equipment, rep_type, exercise_type)
      SELECT $1, unnest($2::text[]), 'other', 'other', 'reps', 'strength'
      ON CONFLICT DO NOTHING
      RETURNING id, name, exercise_type
    `, [userId, namesToInsert]);

    for (const row of created) {
      resolved.set(row.name.toLowerCase(), {
        id: row.id,
        name: row.name,
        displayName: row.name,
        isNew: true,
        exerciseType: row.exercise_type,
      });
    }

    // Handle race condition: if ON CONFLICT triggered, re-fetch the missing ones
    const stillMissing = missing.filter(n => !resolved.has(n));
    if (stillMissing.length > 0) {
      const { rows: existing } = await conn.query(`
        SELECT id, name, names, exercise_type FROM exercises
        WHERE LOWER(name) = ANY($1) AND (user_id IS NULL OR user_id = $2)
      `, [stillMissing, userId]);

      for (const row of existing) {
        resolved.set(row.name.toLowerCase(), {
          id: row.id,
          name: row.name,
          displayName: getLocalizedName(row.names, locale, row.name),
          isNew: false,
          exerciseType: row.exercise_type,
        });
      }
    }
  }

  return resolved;
}

export async function searchExercises(
  query?: string,
  muscleGroup?: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Array<{ id: number; name: string; displayName: string; muscle_group: string; equipment: string; rep_type: string; exercise_type: string; aliases: string[] }>> {
  const userId = getUserId();
  let sql = `
    SELECT e.id, e.name, e.names, e.muscle_group, e.equipment, e.rep_type, e.exercise_type,
      COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}') as aliases
    FROM exercises e
    LEFT JOIN exercise_aliases a ON a.exercise_id = e.id
  `;
  const params: any[] = [userId];
  const conditions: string[] = ["(e.user_id IS NULL OR e.user_id = $1)"];

  if (query) {
    params.push(`%${escapeIlike(query)}%`);
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
  return rows.map(row => ({
    ...row,
    displayName: getLocalizedName(row.names, locale, row.name),
  }));
}
