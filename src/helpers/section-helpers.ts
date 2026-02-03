import { PoolClient } from "pg";

export interface SectionInput {
  label: string;
  notes?: string | null;
}

/**
 * Insert a section row into one of the three section tables.
 * Returns the new section id.
 */
export async function insertSection(
  table: "program_sections" | "session_sections",
  parentColumn: "day_id" | "session_id",
  parentId: number,
  section: SectionInput,
  sortOrder: number,
  client: PoolClient
): Promise<number> {
  const { rows: [{ id }] } = await client.query(
    `INSERT INTO ${table} (${parentColumn}, label, notes, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [parentId, section.label, section.notes || null, sortOrder]
  );
  return id;
}

/**
 * Clone sections from one parent to another (same or different table).
 * Returns a map of oldSectionId → newSectionId for remapping exercises.
 */
export async function cloneSections(
  sourceTable: "program_sections" | "session_sections",
  targetTable: "program_sections" | "session_sections",
  sourceParentColumn: "day_id" | "session_id",
  targetParentColumn: "day_id" | "session_id",
  sourceParentId: number,
  targetParentId: number,
  client: PoolClient
): Promise<Map<number, number>> {
  const { rows: sourceSections } = await client.query(
    `SELECT id, label, notes, sort_order
     FROM ${sourceTable}
     WHERE ${sourceParentColumn} = $1
     ORDER BY sort_order`,
    [sourceParentId]
  );

  const sectionMap = new Map<number, number>();

  for (const ss of sourceSections) {
    const { rows: [{ id: newId }] } = await client.query(
      `INSERT INTO ${targetTable} (${targetParentColumn}, label, notes, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [targetParentId, ss.label, ss.notes, ss.sort_order]
    );
    sectionMap.set(ss.id, newId);
  }

  return sectionMap;
}

/**
 * Batch clone sections from one parent to another in a single query.
 * Uses CTE with RETURNING to map old IDs to new IDs via sort_order.
 * Returns a map of oldSectionId → newSectionId for remapping exercises.
 */
export async function cloneSectionsBatch(
  sourceTable: "program_sections" | "session_sections",
  targetTable: "program_sections" | "session_sections",
  sourceParentColumn: "day_id" | "session_id",
  targetParentColumn: "day_id" | "session_id",
  sourceParentId: number,
  targetParentId: number,
  client: PoolClient
): Promise<Map<number, number>> {
  const { rows } = await client.query(`
    WITH source AS (
      SELECT id, label, notes, sort_order
      FROM ${sourceTable}
      WHERE ${sourceParentColumn} = $1
      ORDER BY sort_order
    ),
    inserted AS (
      INSERT INTO ${targetTable} (${targetParentColumn}, label, notes, sort_order)
      SELECT $2, label, notes, sort_order FROM source
      RETURNING id, sort_order
    )
    SELECT s.id as old_id, i.id as new_id
    FROM source s
    JOIN inserted i ON i.sort_order = s.sort_order
  `, [sourceParentId, targetParentId]);

  return new Map(rows.map(r => [r.old_id, r.new_id]));
}
