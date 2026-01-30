import pool from "../db/connection.js";

export async function getActiveProgram() {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description,
       pv.id as version_id, pv.version_number
     FROM programs p
     JOIN program_versions pv ON pv.program_id = p.id
     WHERE p.is_active = TRUE
     ORDER BY pv.version_number DESC
     LIMIT 1`
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
  const { rows: days } = await pool.query(
    `SELECT id, day_label, weekdays, sort_order
     FROM program_days WHERE version_id = $1 ORDER BY sort_order`,
    [versionId]
  );

  for (const day of days) {
    const { rows: exercises } = await pool.query(
      `SELECT pde.id, e.name as exercise_name, e.id as exercise_id,
         pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe,
         pde.sort_order, pde.superset_group, pde.notes
       FROM program_day_exercises pde
       JOIN exercises e ON e.id = pde.exercise_id
       WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
      [day.id]
    );
    day.exercises = exercises;
  }

  return days;
}

export async function inferTodayDay(programId: number) {
  const version = await getLatestVersion(programId);
  if (!version) return null;

  const isoWeekday = new Date().getDay() || 7; // JS: 0=Sun → ISO: 7=Sun

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

      // Clone exercises for this day
      await client.query(
        `INSERT INTO program_day_exercises
           (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
         SELECT $1, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes
         FROM program_day_exercises WHERE day_id = $2 ORDER BY sort_order`,
        [newDay.id, day.id]
      );
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
