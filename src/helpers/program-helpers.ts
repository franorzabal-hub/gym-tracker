import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { cloneGroups } from "./group-helpers.js";

export async function getActiveProgram() {
  const userId = getUserId();
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.is_active,
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
           'notes', pde.notes,
           'rest_seconds', pde.rest_seconds,
           'rep_type', e.rep_type,
           'exercise_type', e.exercise_type,
           'muscle_group', e.muscle_group
         ) ORDER BY pde.sort_order
       ) FILTER (WHERE pde.id IS NOT NULL), '[]') as exercises
     FROM program_days pd
     LEFT JOIN program_day_exercises pde ON pde.day_id = pd.id
     LEFT JOIN exercises e ON e.id = pde.exercise_id
     LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
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

      // Clone groups for this day
      const groupMap = await cloneGroups(
        "program_exercise_groups", "program_exercise_groups",
        "day_id", "day_id",
        day.id, newDay.id,
        client
      );

      // Clone exercises with remapped group_id
      const { rows: sourceExercises } = await client.query(
        `SELECT * FROM program_day_exercises WHERE day_id = $1 ORDER BY sort_order`,
        [day.id]
      );
      for (const ex of sourceExercises) {
        await client.query(
          `INSERT INTO program_day_exercises
             (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, group_id, rest_seconds, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [newDay.id, ex.exercise_id, ex.target_sets, ex.target_reps, ex.target_weight, ex.target_rpe,
           ex.sort_order, ex.group_id ? (groupMap.get(ex.group_id) ?? null) : null, ex.rest_seconds, ex.notes]
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
