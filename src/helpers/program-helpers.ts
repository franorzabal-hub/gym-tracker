import type { PoolClient } from "pg";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { cloneGroupsBatch } from "./group-helpers.js";
import { cloneSectionsBatch } from "./section-helpers.js";

export interface ExerciseMatch {
  program_day_exercise_id: number;
  day_id: number;
  version_id: number;
  program_id: number;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  sort_order: number;
  section_label: string | null;
  group_label: string | null;
  group_type: string | null;
}

export interface DayMatch {
  day_id: number;
  version_id: number;
  program_id: number;
  day_label: string;
  weekdays: number[] | null;
  sort_order: number;
}

/**
 * Find exercise(s) in user's active program by day label + exercise name.
 * Returns all matches for ambiguity detection.
 */
export async function findProgramExercises(
  userId: number,
  dayLabel: string,
  exerciseName: string,
  programName?: string
): Promise<ExerciseMatch[]> {
  const query = programName
    ? `SELECT pde.id as program_day_exercise_id, pde.day_id, pd.version_id, pv.program_id,
              pde.target_sets, pde.target_reps, pde.target_weight, pde.sort_order,
              ps.label as section_label, peg.label as group_label, peg.group_type
       FROM program_day_exercises pde
       JOIN exercises e ON e.id = pde.exercise_id
       JOIN program_days pd ON pd.id = pde.day_id
       JOIN program_versions pv ON pv.id = pd.version_id
       JOIN programs p ON p.id = pv.program_id
       LEFT JOIN program_sections ps ON ps.id = pde.section_id
       LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
       WHERE p.user_id = $1
         AND LOWER(p.name) = LOWER($4)
         AND LOWER(pd.day_label) = LOWER($2)
         AND LOWER(e.name) = LOWER($3)
         AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
       ORDER BY pde.sort_order`
    : `SELECT pde.id as program_day_exercise_id, pde.day_id, pd.version_id, pv.program_id,
              pde.target_sets, pde.target_reps, pde.target_weight, pde.sort_order,
              ps.label as section_label, peg.label as group_label, peg.group_type
       FROM program_day_exercises pde
       JOIN exercises e ON e.id = pde.exercise_id
       JOIN program_days pd ON pd.id = pde.day_id
       JOIN program_versions pv ON pv.id = pd.version_id
       JOIN programs p ON p.id = pv.program_id
       LEFT JOIN program_sections ps ON ps.id = pde.section_id
       LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
       WHERE p.user_id = $1
         AND p.is_active = TRUE
         AND LOWER(pd.day_label) = LOWER($2)
         AND LOWER(e.name) = LOWER($3)
         AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
       ORDER BY pde.sort_order`;

  const params = programName ? [userId, dayLabel, exerciseName, programName] : [userId, dayLabel, exerciseName];
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get a program_day_exercise by ID with ownership validation.
 */
export async function getProgramExerciseById(
  userId: number,
  pdeId: number
): Promise<ExerciseMatch | null> {
  const { rows } = await pool.query(
    `SELECT pde.id as program_day_exercise_id, pde.day_id, pd.version_id, pv.program_id,
            pde.target_sets, pde.target_reps, pde.target_weight, pde.sort_order,
            ps.label as section_label, peg.label as group_label, peg.group_type
     FROM program_day_exercises pde
     JOIN program_days pd ON pd.id = pde.day_id
     JOIN program_versions pv ON pv.id = pd.version_id
     JOIN programs p ON p.id = pv.program_id
     LEFT JOIN program_sections ps ON ps.id = pde.section_id
     LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
     WHERE pde.id = $1 AND p.user_id = $2`,
    [pdeId, userId]
  );
  return rows[0] || null;
}

/**
 * Find day(s) in user's active program by day label.
 * Returns all matches for ambiguity detection (rare but possible with duplicate labels).
 */
export async function findProgramDays(
  userId: number,
  dayLabel: string,
  programName?: string
): Promise<DayMatch[]> {
  const query = programName
    ? `SELECT pd.id as day_id, pd.version_id, pv.program_id, pd.day_label, pd.weekdays, pd.sort_order
       FROM program_days pd
       JOIN program_versions pv ON pv.id = pd.version_id
       JOIN programs p ON p.id = pv.program_id
       WHERE p.user_id = $1
         AND LOWER(p.name) = LOWER($3)
         AND LOWER(pd.day_label) = LOWER($2)
         AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
       ORDER BY pd.sort_order`
    : `SELECT pd.id as day_id, pd.version_id, pv.program_id, pd.day_label, pd.weekdays, pd.sort_order
       FROM program_days pd
       JOIN program_versions pv ON pv.id = pd.version_id
       JOIN programs p ON p.id = pv.program_id
       WHERE p.user_id = $1
         AND p.is_active = TRUE
         AND LOWER(pd.day_label) = LOWER($2)
         AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
       ORDER BY pd.sort_order`;

  const params = programName ? [userId, dayLabel, programName] : [userId, dayLabel];
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get a program_day by ID with ownership validation.
 */
export async function getProgramDayById(
  userId: number,
  dayId: number
): Promise<DayMatch | null> {
  const { rows } = await pool.query(
    `SELECT pd.id as day_id, pd.version_id, pv.program_id, pd.day_label, pd.weekdays, pd.sort_order
     FROM program_days pd
     JOIN program_versions pv ON pv.id = pd.version_id
     JOIN programs p ON p.id = pv.program_id
     WHERE pd.id = $1 AND p.user_id = $2`,
    [dayId, userId]
  );
  return rows[0] || null;
}

/**
 * Format exercise match for user-friendly display in ambiguity messages.
 */
export function formatExerciseContext(match: ExerciseMatch): string {
  const parts: string[] = [];
  if (match.section_label) parts.push(`Sección: ${match.section_label}`);
  if (match.group_label) parts.push(`Grupo: ${match.group_label} (${match.group_type})`);
  parts.push(`${match.target_sets}×${match.target_reps}`);
  if (match.target_weight) parts.push(`@ ${match.target_weight}kg`);
  parts.push(`posición ${match.sort_order + 1}`);
  return parts.join(", ");
}

export async function getActiveProgram() {
  const userId = getUserId();
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.is_active, p.is_validated,
       pv.id as version_id, pv.version_number
     FROM programs p
     JOIN program_versions pv ON pv.program_id = p.id
     WHERE p.user_id = $1 AND p.is_active = TRUE
     ORDER BY pv.version_number DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function getLatestVersion(programId: number) {
  const { rows } = await pool.query(
    `SELECT id, version_number FROM program_versions
     WHERE program_id = $1 ORDER BY version_number DESC LIMIT 1`,
    [programId]
  );
  return rows[0] || null;
}

export async function getProgramDaysWithExercises(versionId: number) {
  const { rows } = await pool.query(
    `SELECT pd.id, pd.day_label, pd.weekdays, pd.sort_order,
       COALESCE(json_agg(
         json_build_object(
           'id', pde.id,
           'exercise_name', e.name,
           'exercise_id', e.id,
           'target_sets', pde.target_sets,
           'target_reps', pde.target_reps,
           'target_weight', pde.target_weight,
           'target_rpe', pde.target_rpe,
           'sort_order', pde.sort_order,
           'group_id', pde.group_id,
           'group_type', peg.group_type,
           'group_label', peg.label,
           'group_notes', peg.notes,
           'group_rest_seconds', peg.rest_seconds,
           'section_id', pde.section_id,
           'section_label', ps.label,
           'section_notes', ps.notes,
           'notes', pde.notes,
           'rest_seconds', pde.rest_seconds,
           'target_reps_per_set', pde.target_reps_per_set,
           'target_weight_per_set', pde.target_weight_per_set,
           'rep_type', e.rep_type,
           'exercise_type', e.exercise_type,
           'muscle_group', e.muscle_group
         ) ORDER BY pde.sort_order
       ) FILTER (WHERE pde.id IS NOT NULL), '[]') as exercises
     FROM program_days pd
     LEFT JOIN program_day_exercises pde ON pde.day_id = pd.id
     LEFT JOIN exercises e ON e.id = pde.exercise_id
     LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
     LEFT JOIN program_sections ps ON ps.id = pde.section_id
     WHERE pd.version_id = $1
     GROUP BY pd.id
     ORDER BY pd.sort_order`,
    [versionId]
  );
  return rows;
}

export async function inferTodayDay(programId: number, timezone?: string) {
  const version = await getLatestVersion(programId);
  if (!version) return null;

  let isoWeekday: number;
  if (timezone) {
    try {
      const now = new Date();
      const localDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(now);
      const dayMap: Record<string, number> = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
      isoWeekday = dayMap[localDay] || (now.getDay() || 7);
    } catch (err) {
      console.warn(`[inferTodayDay] Invalid timezone "${timezone}", falling back to server time:`, err instanceof Error ? err.message : err);
      isoWeekday = new Date().getDay() || 7;
    }
  } else {
    isoWeekday = new Date().getDay() || 7; // JS: 0=Sun → ISO: 7=Sun
  }

  const { rows } = await pool.query(
    `SELECT id, day_label, weekdays, sort_order
     FROM program_days
     WHERE version_id = $1 AND $2 = ANY(weekdays)
     ORDER BY sort_order LIMIT 1`,
    [version.id, isoWeekday]
  );

  return rows[0] || null;
}

export async function cloneVersion(
  programId: number,
  currentVersionId: number,
  changeDescription: string
): Promise<{ newVersionId: number; versionNumber: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current version number
    const { rows: [current] } = await client.query(
      "SELECT version_number FROM program_versions WHERE id = $1",
      [currentVersionId]
    );
    if (!current) {
      throw new Error(`Program version ${currentVersionId} not found`);
    }
    const newVersionNumber = current.version_number + 1;

    // Create new version
    const { rows: [newVersion] } = await client.query(
      `INSERT INTO program_versions (program_id, version_number, change_description)
       VALUES ($1, $2, $3) RETURNING id`,
      [programId, newVersionNumber, changeDescription]
    );

    // Clone days
    const { rows: days } = await client.query(
      "SELECT * FROM program_days WHERE version_id = $1 ORDER BY sort_order",
      [currentVersionId]
    );

    for (const day of days) {
      const { rows: [newDay] } = await client.query(
        `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [newVersion.id, day.day_label, day.weekdays, day.sort_order]
      );

      // Clone groups for this day (batch: 1 query instead of N)
      const groupMap = await cloneGroupsBatch(
        "program_exercise_groups", "program_exercise_groups",
        "day_id", "day_id",
        day.id, newDay.id,
        client
      );

      // Clone sections for this day (batch: 1 query instead of N)
      const sectionMap = await cloneSectionsBatch(
        "program_sections", "program_sections",
        "day_id", "day_id",
        day.id, newDay.id,
        client
      );

      // Clone exercises with remapped group_id and section_id
      const { rows: sourceExercises } = await client.query(
        `SELECT * FROM program_day_exercises WHERE day_id = $1 ORDER BY sort_order`,
        [day.id]
      );
      for (const ex of sourceExercises) {
        await client.query(
          `INSERT INTO program_day_exercises
             (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes, section_id, target_reps_per_set, target_weight_per_set)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [newDay.id, ex.exercise_id, ex.target_sets, ex.target_reps, ex.target_weight, ex.target_rpe,
           ex.sort_order, ex.group_id ? (groupMap.get(ex.group_id) ?? null) : null, ex.rest_seconds, ex.notes,
           ex.section_id ? (sectionMap.get(ex.section_id) ?? null) : null,
           ex.target_reps_per_set || null, ex.target_weight_per_set || null]
        );
      }
    }

    await client.query("COMMIT");
    return { newVersionId: newVersion.id, versionNumber: newVersionNumber };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
