import { PoolClient } from "pg";

export interface GroupInput {
  group_type: "superset" | "paired" | "circuit";
  label?: string | null;
  notes?: string | null;
  rest_seconds?: number | null;
}

/**
 * Insert a group row into one of the three group tables.
 * Returns the new group id.
 */
export async function insertGroup(
  table: "program_exercise_groups" | "session_exercise_groups",
  parentColumn: "day_id" | "session_id",
  parentId: number,
  group: GroupInput,
  sortOrder: number,
  client: PoolClient
): Promise<number> {
  const { rows: [{ id }] } = await client.query(
    `INSERT INTO ${table} (${parentColumn}, group_type, label, notes, rest_seconds, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [parentId, group.group_type, group.label || null, group.notes || null, group.rest_seconds ?? null, sortOrder]
  );
  return id;
}

/**
 * Clone groups from one parent to another (same or different table).
 * Returns a map of oldGroupId → newGroupId for remapping exercises.
 */
export async function cloneGroups(
  sourceTable: "program_exercise_groups" | "session_exercise_groups",
  targetTable: "program_exercise_groups" | "session_exercise_groups",
  sourceParentColumn: "day_id" | "session_id",
  targetParentColumn: "day_id" | "session_id",
  sourceParentId: number,
  targetParentId: number,
  client: PoolClient
): Promise<Map<number, number>> {
  const { rows: sourceGroups } = await client.query(
    `SELECT id, group_type, label, notes, rest_seconds, sort_order
     FROM ${sourceTable}
     WHERE ${sourceParentColumn} = $1
     ORDER BY sort_order`,
    [sourceParentId]
  );

  const groupMap = new Map<number, number>();

  for (const sg of sourceGroups) {
    const { rows: [{ id: newId }] } = await client.query(
      `INSERT INTO ${targetTable} (${targetParentColumn}, group_type, label, notes, rest_seconds, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [targetParentId, sg.group_type, sg.label, sg.notes, sg.rest_seconds, sg.sort_order]
    );
    groupMap.set(sg.id, newId);
  }

  return groupMap;
}

/**
 * Batch clone groups from one parent to another in a single query.
 * Uses CTE with RETURNING to map old IDs to new IDs via sort_order.
 * Returns a map of oldGroupId → newGroupId for remapping exercises.
 */
export async function cloneGroupsBatch(
  sourceTable: "program_exercise_groups" | "session_exercise_groups",
  targetTable: "program_exercise_groups" | "session_exercise_groups",
  sourceParentColumn: "day_id" | "session_id",
  targetParentColumn: "day_id" | "session_id",
  sourceParentId: number,
  targetParentId: number,
  client: PoolClient
): Promise<Map<number, number>> {
  const { rows } = await client.query(`
    WITH source AS (
      SELECT id, group_type, label, notes, rest_seconds, sort_order
      FROM ${sourceTable}
      WHERE ${sourceParentColumn} = $1
      ORDER BY sort_order
    ),
    inserted AS (
      INSERT INTO ${targetTable} (${targetParentColumn}, group_type, label, notes, rest_seconds, sort_order)
      SELECT $2, group_type, label, notes, rest_seconds, sort_order FROM source
      RETURNING id, sort_order
    )
    SELECT s.id as old_id, i.id as new_id
    FROM source s
    JOIN inserted i ON i.sort_order = s.sort_order
  `, [sourceParentId, targetParentId]);

  return new Map(rows.map(r => [r.old_id, r.new_id]));
}
