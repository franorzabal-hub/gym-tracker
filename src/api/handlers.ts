/**
 * API Handlers — Business logic for the unified api tool.
 * Each handler corresponds to an API endpoint.
 */

import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { getProfile, isProfileComplete, normalizeProfileData, profileSchema, MAX_PROFILE_SIZE_BYTES, getUserLocale, getLocalizedName } from "../helpers/profile-helpers.js";
import { inferTodayDay, getActiveProgram } from "../helpers/program-helpers.js";
import { resolveExercise, searchExercises, findExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { logSingleExercise } from "../helpers/log-exercise-helper.js";
import { cloneGroupsBatch } from "../helpers/group-helpers.js";
import { cloneSectionsBatch } from "../helpers/section-helpers.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { escapeIlike } from "../helpers/parse-helpers.js";
import type { ExerciseOverride, PRCheck, ExerciseType, ProgramDayRow } from "../db/types.js";

// ============================================================================
// CONTEXT
// ============================================================================

export async function getContext() {
  const userId = getUserId();

  // Profile
  const profileData = await getProfile();
  const profileComplete = isProfileComplete(profileData);

  // Active program
  const { rows: programRows } = await pool.query(
    `SELECT p.id, p.name, pv.id as version_id
     FROM programs p
     JOIN program_versions pv ON pv.program_id = p.id
     WHERE p.user_id = $1 AND p.is_active = TRUE
     ORDER BY pv.version_number DESC LIMIT 1`,
    [userId]
  );
  const activeProgram = programRows[0] || null;

  // Today's day
  let todayDay: { day_label: string } | null = null;
  if (activeProgram) {
    const timezone = (profileData.timezone as string | undefined) || undefined;
    const inferred = await inferTodayDay(activeProgram.id, timezone);
    if (inferred) {
      todayDay = { day_label: inferred.day_label };
    }
  }

  // History check
  const { rows: historyRows } = await pool.query(
    "SELECT id FROM sessions WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1",
    [userId]
  );
  const hasHistory = historyRows.length > 0;

  // Active workout
  const { rows: activeRows } = await pool.query(
    "SELECT id, started_at, program_day_id, tags FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [userId]
  );

  let activeWorkout: any = null;
  if (activeRows.length > 0) {
    const session = activeRows[0];
    const durationMinutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);

    let programDay: string | undefined;
    if (session.program_day_id) {
      const { rows: dayRows } = await pool.query(
        "SELECT day_label FROM program_days WHERE id = $1",
        [session.program_day_id]
      );
      if (dayRows.length > 0) programDay = dayRows[0].day_label;
    }

    const { rows: [counts] } = await pool.query(
      `SELECT COUNT(DISTINCT se.id) as exercise_count, COUNT(st.id) as set_count
       FROM session_exercises se
       LEFT JOIN sets st ON st.session_exercise_id = se.id
       WHERE se.session_id = $1`,
      [session.id]
    );

    activeWorkout = {
      id: session.id,
      started_at: session.started_at,
      duration_minutes: durationMinutes,
      program_day: programDay,
      exercises_logged: Number(counts.exercise_count),
      sets_logged: Number(counts.set_count),
      tags: session.tags || [],
    };
  }

  // Routing
  const isNewUser = !profileComplete && !activeProgram && !hasHistory;
  let required_action: string | null = null;
  let suggestion: string | null = null;

  if (isNewUser) {
    required_action = "setup_profile";
  } else if (!profileComplete) {
    suggestion = "Profile incomplete. Ask the user if they want to update their profile.";
  } else if (!activeProgram) {
    required_action = "choose_program";
  } else if (activeWorkout) {
    suggestion = `Active workout in progress (${activeWorkout.duration_minutes} min). Continue logging or end the workout.`;
  } else if (todayDay) {
    suggestion = `Today is ${todayDay.day_label}. Ask if they want to start training.`;
  }

  return {
    profile: { complete: profileComplete, data: profileData },
    program: { active: activeProgram ? activeProgram.name : null, today_day: todayDay?.day_label || null },
    active_workout: activeWorkout,
    has_history: hasHistory,
    required_action,
    suggestion,
  };
}

// ============================================================================
// PROFILE
// ============================================================================

export async function getProfileHandler() {
  const userId = getUserId();
  const { rows } = await pool.query(
    "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return { profile: rows[0]?.data || {} };
}

export async function updateProfile(data: Record<string, any>) {
  const userId = getUserId();

  if (!data || Object.keys(data).length === 0) {
    throw new Error("No data provided");
  }

  const normalized = normalizeProfileData(data);
  if (JSON.stringify(normalized).length > MAX_PROFILE_SIZE_BYTES) {
    throw new Error("Profile data exceeds maximum size limit");
  }

  const parsed = profileSchema.safeParse(normalized);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid profile data: ${errors.join(', ')}`);
  }

  const { rows } = await pool.query(
    `INSERT INTO user_profile (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET data = user_profile.data || EXCLUDED.data, updated_at = NOW()
     RETURNING data`,
    [userId, JSON.stringify(parsed.data)]
  );

  return { profile: rows[0].data };
}

// ============================================================================
// EXERCISES
// ============================================================================

export async function listExercises(params: { muscle_group?: string; limit?: number; offset?: number }) {
  const userId = getUserId();
  const locale = await getUserLocale();
  const effectiveLimit = params.limit ?? 100;
  const effectiveOffset = params.offset ?? 0;

  const queryParams: (number | string)[] = [userId];
  const conditions: string[] = ["(e.user_id IS NULL OR e.user_id = $1)"];

  if (params.muscle_group) {
    queryParams.push(params.muscle_group.toLowerCase());
    conditions.push(`LOWER(e.muscle_group) = $${queryParams.length}`);
  }

  const whereClause = " WHERE " + conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT e.id) as total FROM exercises e${whereClause}`,
    queryParams
  );
  const total = Number(countResult.rows[0].total);

  queryParams.push(effectiveLimit);
  const limitIdx = queryParams.length;
  queryParams.push(effectiveOffset);
  const offsetIdx = queryParams.length;

  const { rows: results } = await pool.query(
    `SELECT e.id, e.name, e.names, e.muscle_group, e.equipment, e.rep_type, e.exercise_type,
      COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}') as aliases
    FROM exercises e
    LEFT JOIN exercise_aliases a ON a.exercise_id = e.id
    ${whereClause}
    GROUP BY e.id ORDER BY e.user_id NULLS LAST, e.name
    LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    queryParams
  );

  const exercises = results.map(row => ({
    ...row,
    displayName: getLocalizedName(row.names, locale, row.name),
  }));

  return { exercises, total };
}

export async function searchExercisesHandler(params: { query?: string; muscle_group?: string }) {
  const locale = await getUserLocale();
  const results = await searchExercises(params.query, params.muscle_group, locale);
  return { exercises: results };
}

export async function addExercise(params: {
  name: string;
  muscle_group?: string;
  equipment?: string;
  aliases?: string[];
  rep_type?: string;
  exercise_type?: string;
}) {
  const resolved = await resolveExercise(
    params.name,
    params.muscle_group,
    params.equipment,
    params.rep_type as any,
    params.exercise_type as any
  );

  const failedAliases: string[] = [];
  if (params.aliases && params.aliases.length > 0) {
    for (const a of params.aliases) {
      try {
        await pool.query(
          "INSERT INTO exercise_aliases (exercise_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [resolved.id, a.toLowerCase().trim()]
        );
      } catch (err) {
        failedAliases.push(a);
      }
    }
  }

  return {
    exercise: { id: resolved.id, name: resolved.name },
    is_new: resolved.isNew,
    ...(failedAliases.length > 0 ? { failed_aliases: failedAliases } : {}),
  };
}

export async function addExercisesBulk(params: {
  exercises: Array<{
    name: string;
    muscle_group?: string;
    equipment?: string;
    aliases?: string[];
    rep_type?: string;
    exercise_type?: string;
  }>;
}) {
  const created: string[] = [];
  const existing: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const ex of params.exercises) {
    try {
      const resolved = await resolveExercise(
        ex.name,
        ex.muscle_group,
        ex.equipment,
        ex.rep_type as any,
        ex.exercise_type as any
      );

      if (resolved.isNew) {
        created.push(resolved.name);
      } else {
        existing.push(resolved.name);
      }

      if (ex.aliases && ex.aliases.length > 0) {
        for (const a of ex.aliases) {
          try {
            await pool.query(
              "INSERT INTO exercise_aliases (exercise_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING",
              [resolved.id, a.toLowerCase().trim()]
            );
          } catch (err) {
            failed.push({ name: `${ex.name} (alias: ${a})`, error: err instanceof Error ? err.message : "Unknown error" });
          }
        }
      }
    } catch (err: any) {
      failed.push({ name: ex.name, error: err.message || "Unknown error" });
    }
  }

  return { created, existing, failed: failed.length > 0 ? failed : undefined, total: params.exercises.length };
}

export async function updateExercise(name: string, data: {
  muscle_group?: string;
  equipment?: string;
  rep_type?: string;
  exercise_type?: string;
}) {
  const userId = getUserId();

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (data.muscle_group) { params.push(data.muscle_group); updates.push(`muscle_group = $${params.length}`); }
  if (data.equipment) { params.push(data.equipment); updates.push(`equipment = $${params.length}`); }
  if (data.rep_type) { params.push(data.rep_type); updates.push(`rep_type = $${params.length}`); }
  if (data.exercise_type) { params.push(data.exercise_type); updates.push(`exercise_type = $${params.length}`); }

  if (updates.length === 0) {
    throw new Error("Provide at least one field to update");
  }

  const checkGlobal = await pool.query(
    `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
    [name, userId]
  );
  if (checkGlobal.rows.length === 0) {
    throw new Error(`Exercise "${name}" not found`);
  }
  if (checkGlobal.rows[0].user_id === null) {
    throw new Error("Exercise is global and cannot be modified");
  }

  params.push(name);
  params.push(userId);
  const { rows } = await pool.query(
    `UPDATE exercises SET ${updates.join(", ")} WHERE LOWER(name) = LOWER($${params.length - 1}) AND user_id = $${params.length} RETURNING id, name, muscle_group, equipment, rep_type, exercise_type`,
    params
  );

  if (rows.length === 0) {
    throw new Error(`Exercise "${name}" not found`);
  }

  return { updated: rows[0] };
}

export async function deleteExercise(name: string) {
  const userId = getUserId();

  const checkGlobal = await pool.query(
    `SELECT id, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
    [name, userId]
  );
  if (checkGlobal.rows.length === 0) {
    throw new Error(`Exercise "${name}" not found`);
  }
  if (checkGlobal.rows[0].user_id === null) {
    throw new Error("Exercise is global and cannot be deleted");
  }

  const refs = await pool.query(
    `SELECT COUNT(*) as count FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     WHERE LOWER(e.name) = LOWER($1) AND e.user_id = $2`,
    [name, userId]
  );
  const refCount = Number(refs.rows[0].count);

  const { rows } = await pool.query(
    `DELETE FROM exercises WHERE LOWER(name) = LOWER($1) AND user_id = $2 RETURNING id, name`,
    [name, userId]
  );

  if (rows.length === 0) {
    throw new Error(`Exercise "${name}" not found`);
  }

  return {
    deleted: rows[0],
    warning: refCount > 0 ? `Referenced in ${refCount} session log(s). Aliases cascade-deleted.` : undefined
  };
}

export async function mergeExercises(source: string, target: string) {
  const userId = getUserId();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sourceResult = await client.query(
      `SELECT id, name, user_id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
      [source, userId]
    );
    if (sourceResult.rows.length === 0) {
      throw new Error(`Source exercise "${source}" not found`);
    }
    const sourceEx = sourceResult.rows[0];
    if (sourceEx.user_id === null) {
      throw new Error("Cannot merge a global exercise as source");
    }

    const targetResult = await client.query(
      `SELECT id, name FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2) ORDER BY user_id NULLS LAST LIMIT 1`,
      [target, userId]
    );
    if (targetResult.rows.length === 0) {
      throw new Error(`Target exercise "${target}" not found`);
    }
    const targetEx = targetResult.rows[0];

    if (sourceEx.id === targetEx.id) {
      throw new Error("Source and target are the same exercise");
    }

    // Move session_exercises
    const seResult = await client.query(
      `UPDATE session_exercises SET exercise_id = $1 WHERE exercise_id = $2 AND session_id IN (SELECT id FROM sessions WHERE user_id = $3)`,
      [targetEx.id, sourceEx.id, userId]
    );

    // Handle PRs
    await client.query(
      `DELETE FROM personal_records pr_source
       WHERE pr_source.exercise_id = $1 AND pr_source.user_id = $2
         AND EXISTS (
           SELECT 1 FROM personal_records pr_target
           WHERE pr_target.exercise_id = $3 AND pr_target.user_id = $2
             AND pr_target.record_type = pr_source.record_type
             AND pr_target.value >= pr_source.value
         )`,
      [sourceEx.id, userId, targetEx.id]
    );
    await client.query(
      `DELETE FROM personal_records pr_target
       WHERE pr_target.exercise_id = $1 AND pr_target.user_id = $2
         AND EXISTS (
           SELECT 1 FROM personal_records pr_source
           WHERE pr_source.exercise_id = $3 AND pr_source.user_id = $2
             AND pr_source.record_type = pr_target.record_type
             AND pr_source.value > pr_target.value
         )`,
      [targetEx.id, userId, sourceEx.id]
    );
    const prResult = await client.query(
      `UPDATE personal_records SET exercise_id = $1 WHERE exercise_id = $2 AND user_id = $3`,
      [targetEx.id, sourceEx.id, userId]
    );

    // Move pr_history
    const phResult = await client.query(
      `UPDATE pr_history SET exercise_id = $1 WHERE exercise_id = $2 AND user_id = $3`,
      [targetEx.id, sourceEx.id, userId]
    );

    // Move aliases
    await client.query(
      `UPDATE exercise_aliases SET exercise_id = $1
       WHERE exercise_id = $2
         AND LOWER(alias) NOT IN (SELECT LOWER(alias) FROM exercise_aliases WHERE exercise_id = $1)`,
      [targetEx.id, sourceEx.id]
    );
    await client.query(`DELETE FROM exercise_aliases WHERE exercise_id = $1`, [sourceEx.id]);

    // Delete source
    await client.query(`DELETE FROM exercises WHERE id = $1`, [sourceEx.id]);

    await client.query("COMMIT");

    return {
      merged: {
        source: sourceEx.name,
        target: targetEx.name,
        session_exercises_moved: seResult.rowCount || 0,
        personal_records_moved: prResult.rowCount || 0,
        pr_history_moved: phResult.rowCount || 0,
      }
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// PROGRAMS
// ============================================================================

export async function listPrograms(mode: "user" | "available" = "user") {
  const userId = getUserId();

  if (mode === "available") {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.is_active,
        (SELECT COUNT(*) FROM program_days pd
         JOIN program_versions pv ON pv.id = pd.version_id
         WHERE pv.program_id = p.id) as days_count
       FROM programs p
       WHERE p.user_id IS NULL
       ORDER BY p.name`
    );
    return { programs: rows };
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.is_active,
      (SELECT COUNT(*) FROM program_days pd
       JOIN program_versions pv ON pv.id = pd.version_id
       WHERE pv.program_id = p.id
       ORDER BY pv.version_number DESC LIMIT 1) as days_count
     FROM programs p
     WHERE p.user_id = $1
     ORDER BY p.is_active DESC, p.name`,
    [userId]
  );
  return { programs: rows };
}

export async function getProgram(id: number) {
  const userId = getUserId();

  const { rows: [program] } = await pool.query(
    `SELECT p.id, p.name, p.is_active, pv.id as version_id, pv.version_number
     FROM programs p
     JOIN program_versions pv ON pv.program_id = p.id
     WHERE p.id = $1 AND (p.user_id = $2 OR p.user_id IS NULL)
     ORDER BY pv.version_number DESC LIMIT 1`,
    [id, userId]
  );

  if (!program) {
    throw new Error("Program not found");
  }

  const { rows: days } = await pool.query(
    `SELECT pd.id, pd.day_label, pd.weekdays,
      COALESCE(json_agg(
        json_build_object(
          'id', pde.id,
          'exercise_id', e.id,
          'exercise', e.name,
          'target_sets', pde.target_sets,
          'target_reps', pde.target_reps,
          'target_weight', pde.target_weight,
          'target_rpe', pde.target_rpe,
          'rest_seconds', pde.rest_seconds,
          'notes', pde.notes,
          'group_id', pde.group_id,
          'section_id', pde.section_id
        ) ORDER BY pde.sort_order
      ) FILTER (WHERE pde.id IS NOT NULL), '[]') as exercises
     FROM program_days pd
     LEFT JOIN program_day_exercises pde ON pde.day_id = pd.id
     LEFT JOIN exercises e ON e.id = pde.exercise_id
     WHERE pd.version_id = $1
     GROUP BY pd.id
     ORDER BY pd.sort_order`,
    [program.version_id]
  );

  return { program: { ...program, days } };
}

export async function activateProgram(id: number) {
  const userId = getUserId();

  // Deactivate all
  await pool.query(
    "UPDATE programs SET is_active = FALSE WHERE user_id = $1",
    [userId]
  );

  // Activate selected
  const { rows } = await pool.query(
    "UPDATE programs SET is_active = TRUE WHERE id = $1 AND user_id = $2 RETURNING id, name",
    [id, userId]
  );

  if (rows.length === 0) {
    throw new Error("Program not found or not owned by user");
  }

  return { activated: rows[0] };
}

export async function deleteProgram(id: number) {
  const userId = getUserId();

  const { rows } = await pool.query(
    "DELETE FROM programs WHERE id = $1 AND user_id = $2 RETURNING id, name",
    [id, userId]
  );

  if (rows.length === 0) {
    throw new Error("Program not found or not owned by user");
  }

  return { deleted: rows[0] };
}

// ============================================================================
// WORKOUTS
// ============================================================================

interface DayExerciseRow {
  id: number;
  exercise_id: number;
  exercise_name: string;
  exercise_type: ExerciseType;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  sort_order: number;
  group_id: number | null;
  section_id: number | null;
}

export async function logWorkout(params: {
  program_day?: string;
  date?: string;
  tags?: string[];
  notes?: string;
  exercise?: string;
  sets?: number;
  reps?: number | number[];
  weight?: number;
  rpe?: number;
  set_type?: string;
  exercises?: Array<{
    exercise: string;
    sets?: number;
    reps: number | number[];
    weight?: number;
    rpe?: number;
    set_type?: string;
    notes?: string;
  }>;
  skip?: string[];
  overrides?: Array<{ exercise: string; sets?: number; reps?: number; weight?: number; rpe?: number }>;
}) {
  const userId = getUserId();
  const locale = await getUserLocale();

  const hasExplicitExercise = !!params.exercise;
  const hasBulkExercises = params.exercises && params.exercises.length > 0;
  const hasProgramDay = !!params.program_day;
  const hasAnyExercises = hasExplicitExercise || hasBulkExercises;

  // Resolve program day
  let programVersionId: number | null = null;
  let programDayId: number | null = null;
  let dayInfo: ProgramDayRow | null = null;
  let dayExercises: DayExerciseRow[] = [];

  const activeProgram = await getActiveProgram();

  if (hasProgramDay || !hasAnyExercises) {
    if (activeProgram) {
      programVersionId = activeProgram.version_id;

      if (params.program_day) {
        const { rows } = await pool.query(
          `SELECT pd.id, pd.day_label, pd.weekdays FROM program_days pd
           WHERE pd.version_id = $1 AND LOWER(pd.day_label) = LOWER($2) LIMIT 1`,
          [activeProgram.version_id, params.program_day]
        );
        if (rows.length > 0) {
          programDayId = rows[0].id;
          dayInfo = rows[0];
        }
      } else {
        const { rows: profileRows } = await pool.query(
          "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        const timezone = profileRows[0]?.timezone || undefined;
        const inferred = await inferTodayDay(activeProgram.id, timezone);
        if (inferred) {
          programDayId = inferred.id;
          dayInfo = inferred;
        }
      }

      if (dayInfo && hasProgramDay) {
        const { rows } = await pool.query(
          `SELECT pde.*, e.name as exercise_name, e.id as exercise_id, e.exercise_type, pde.group_id, pde.section_id
           FROM program_day_exercises pde
           JOIN exercises e ON e.id = pde.exercise_id
           WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
          [dayInfo.id]
        );
        dayExercises = rows;
      }
    }

    if (hasProgramDay && !dayInfo) {
      if (!activeProgram) {
        throw new Error("No active program found");
      }
      throw new Error("No program day found. Specify a valid day label.");
    }
  }

  // Transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get or create session
    const activeSession = await client.query(
      "SELECT id, started_at, program_day_id, is_validated FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [userId]
    );

    let sessionId: number;
    let sessionCreated = false;
    let sessionValidated = true;
    let sessionStartedAt: Date;

    if (activeSession.rows.length > 0) {
      sessionId = activeSession.rows[0].id;
      sessionValidated = activeSession.rows[0].is_validated;
      sessionStartedAt = new Date(activeSession.rows[0].started_at);

      if (!activeSession.rows[0].program_day_id && programDayId) {
        await client.query(
          "UPDATE sessions SET program_day_id = $1, program_version_id = COALESCE(program_version_id, $2) WHERE id = $3 AND user_id = $4",
          [programDayId, programVersionId, sessionId, userId]
        );
      }

      if (params.tags && params.tags.length > 0) {
        await client.query(
          "UPDATE sessions SET tags = $1 WHERE id = $2 AND user_id = $3",
          [params.tags, sessionId, userId]
        );
      }

      if (params.notes) {
        await client.query(
          "UPDATE sessions SET notes = COALESCE(notes || ' ' || $1, $1) WHERE id = $2 AND user_id = $3",
          [params.notes, sessionId, userId]
        );
      }
    } else {
      const { rows: profileRows } = await client.query(
        "SELECT data->>'requires_validation' as req_val FROM user_profile WHERE user_id = $1",
        [userId]
      );
      const requiresValidation = profileRows[0]?.req_val === 'true';

      sessionStartedAt = params.date ? new Date(params.date + 'T00:00:00') : new Date();
      const { rows: [newSession] } = await client.query(
        `INSERT INTO sessions (user_id, program_version_id, program_day_id, notes, started_at, tags, is_validated)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, started_at, is_validated`,
        [userId, programVersionId, programDayId, params.notes || null, sessionStartedAt, params.tags || [], !requiresValidation]
      );
      sessionId = newSession.id;
      sessionCreated = true;
      sessionValidated = newSession.is_validated;
    }

    // Log program day exercises
    const routineResults: Array<{ exercise: string; sets: number; reps: number; weight?: number; rpe?: number }> = [];
    let totalRoutineSets = 0;
    let totalRoutineVolume = 0;
    const allPRs: Array<{ exercise: string; prs: PRCheck[] }> = [];

    if (hasProgramDay && dayExercises.length > 0 && dayInfo) {
      const skipSet = new Set((params.skip || []).map(s => s.toLowerCase().trim()));
      const overrideMap = new Map<string, ExerciseOverride>();

      for (const o of params.overrides || []) {
        const resolved = await resolveExercise(o.exercise, undefined, undefined, undefined, undefined, client, locale);
        overrideMap.set(resolved.name.toLowerCase(), o);
      }

      const groupMap = await cloneGroupsBatch(
        "program_exercise_groups", "session_exercise_groups",
        "day_id", "session_id",
        dayInfo.id, sessionId,
        client
      );

      const sectionMap = await cloneSectionsBatch(
        "program_sections", "session_sections",
        "day_id", "session_id",
        dayInfo.id, sessionId,
        client
      );

      for (const dex of dayExercises) {
        if (skipSet.has(dex.exercise_name.toLowerCase()) || skipSet.has(dex.exercise_id.toString())) {
          continue;
        }

        const override = overrideMap.get(dex.exercise_name.toLowerCase());
        const sets = override?.sets || dex.target_sets;
        const reps = override?.reps || dex.target_reps;
        const weight = override?.weight ?? dex.target_weight;
        const rpe = override?.rpe ?? dex.target_rpe;

        const sessionGroupId = dex.group_id ? (groupMap.get(dex.group_id) ?? null) : null;
        const sessionSectionId = dex.section_id ? (sectionMap.get(dex.section_id) ?? null) : null;

        const { rows: [se] } = await client.query(
          `INSERT INTO session_exercises (session_id, exercise_id, sort_order, group_id, rest_seconds, section_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [sessionId, dex.exercise_id, dex.sort_order, sessionGroupId, dex.rest_seconds || null, sessionSectionId]
        );

        const setNumbers = Array.from({ length: sets }, (_, i) => i + 1);
        const setReps = Array(sets).fill(reps);
        const setWeights = Array(sets).fill(weight || null);
        const setRPEs = Array(sets).fill(rpe || null);

        const { rows: insertedSets } = await client.query(
          `INSERT INTO sets (session_exercise_id, set_number, reps, weight, rpe)
           SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::real[]), unnest($5::real[])
           RETURNING id`,
          [se.id, setNumbers, setReps, setWeights, setRPEs]
        );
        const setIds = insertedSets.map((row: { id: number }) => row.id);

        totalRoutineSets += sets;
        if (weight) totalRoutineVolume += weight * reps * sets;

        if (sessionValidated) {
          const prs = await checkPRs(
            dex.exercise_id,
            setIds.map((id: number) => ({ reps, weight: weight ?? null, set_id: id })),
            dex.exercise_type,
            client,
            sessionStartedAt
          );
          if (prs.length > 0) allPRs.push({ exercise: dex.exercise_name, prs });
        }

        routineResults.push({
          exercise: dex.exercise_name,
          sets,
          reps,
          weight: weight || undefined,
          rpe: rpe || undefined,
        });
      }
    }

    // Log explicit exercises
    const explicitResults: Array<Record<string, unknown>> = [];

    if (hasBulkExercises) {
      for (const entry of params.exercises!) {
        const result = await logSingleExercise(sessionId, entry as any, client, sessionValidated, locale, sessionStartedAt);
        explicitResults.push(result);
        if (result.new_prs) {
          for (const pr of result.new_prs) {
            allPRs.push({ exercise: result.exercise_name, prs: [pr] });
          }
        }
      }
    } else if (hasExplicitExercise) {
      if (!params.reps) {
        await client.query("ROLLBACK");
        throw new Error("Reps required when logging an exercise");
      }

      const result = await logSingleExercise(sessionId, {
        exercise: params.exercise!,
        sets: params.sets || 1,
        reps: params.reps,
        weight: params.weight,
        rpe: params.rpe,
        set_type: params.set_type as any,
      }, client, sessionValidated, locale, sessionStartedAt);
      explicitResults.push(result);
      if (result.new_prs) {
        for (const pr of result.new_prs) {
          allPRs.push({ exercise: result.exercise_name, prs: [pr] });
        }
      }
    }

    await client.query("COMMIT");

    // Session-only mode
    if (routineResults.length === 0 && explicitResults.length === 0) {
      const result: Record<string, unknown> = {
        session_id: sessionId,
        session_created: sessionCreated,
      };

      if (dayInfo) {
        const { rows: planExercises } = await pool.query(
          `SELECT e.name, pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe, pde.rest_seconds, pde.notes
           FROM program_day_exercises pde
           JOIN exercises e ON e.id = pde.exercise_id
           WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
          [programDayId]
        );
        result.program_day = { label: dayInfo.day_label, exercises: planExercises };
      }

      return result;
    }

    // Build response
    const response: Record<string, unknown> = { session_id: sessionId };

    if (routineResults.length > 0) {
      response.day_label = dayInfo?.day_label;
      response.routine_exercises = routineResults;
      response.total_routine_sets = totalRoutineSets;
      response.total_routine_volume_kg = Math.round(totalRoutineVolume);
    }

    if (explicitResults.length === 1 && !hasBulkExercises) {
      Object.assign(response, explicitResults[0]);
    } else if (explicitResults.length > 0) {
      response.exercises_logged = explicitResults;
    }

    if (allPRs.length > 0) {
      response.new_prs = allPRs;
    }

    return response;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function endWorkout(params: { notes?: string; force?: boolean; tags?: string[] }) {
  const userId = getUserId();

  const { rows: [session] } = await pool.query(
    `SELECT s.id, s.started_at, s.program_day_id, pd.day_label
     FROM sessions s
     LEFT JOIN program_days pd ON pd.id = s.program_day_id
     WHERE s.user_id = $1 AND s.ended_at IS NULL AND s.deleted_at IS NULL
     ORDER BY s.started_at DESC LIMIT 1`,
    [userId]
  );

  if (!session) {
    throw new Error("No active workout to end");
  }

  // Check if any exercises logged
  const { rows: [counts] } = await pool.query(
    `SELECT COUNT(DISTINCT se.id) as exercise_count, COUNT(st.id) as set_count
     FROM session_exercises se
     LEFT JOIN sets st ON st.session_exercise_id = se.id
     WHERE se.session_id = $1`,
    [session.id]
  );

  if (!params.force && Number(counts.exercise_count) === 0) {
    throw new Error("No exercises logged. Use force=true to end anyway or delete the workout.");
  }

  // End session
  const updates: string[] = ["ended_at = NOW()"];
  const queryParams: any[] = [];

  if (params.notes) {
    queryParams.push(params.notes);
    updates.push(`notes = COALESCE(notes || ' ' || $${queryParams.length}, $${queryParams.length})`);
  }

  if (params.tags && params.tags.length > 0) {
    queryParams.push(params.tags);
    updates.push(`tags = $${queryParams.length}`);
  }

  queryParams.push(session.id);
  queryParams.push(userId);

  await pool.query(
    `UPDATE sessions SET ${updates.join(", ")} WHERE id = $${queryParams.length - 1} AND user_id = $${queryParams.length}`,
    queryParams
  );

  // Get summary
  const { rows: exercises } = await pool.query(
    `SELECT e.name,
      COUNT(st.id) as sets,
      COALESCE(SUM(st.weight * st.reps), 0) as volume
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     LEFT JOIN sets st ON st.session_exercise_id = se.id AND st.set_type != 'warmup'
     WHERE se.session_id = $1
     GROUP BY e.name, se.sort_order
     ORDER BY se.sort_order`,
    [session.id]
  );

  const durationMinutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
  const totalVolume = exercises.reduce((acc, ex) => acc + Number(ex.volume), 0);

  return {
    summary: {
      session_id: session.id,
      duration_minutes: durationMinutes,
      program_day: session.day_label,
      exercises: exercises.map(ex => ({ name: ex.name, sets: Number(ex.sets) })),
      total_volume_kg: Math.round(totalVolume),
    }
  };
}

export async function getWorkouts(params: {
  period?: string | number;
  exercise?: string;
  program_day?: string;
  tags?: string[];
  workout_id?: number;
  limit?: number;
  offset?: number;
  summary_only?: boolean;
  include_sets?: boolean;
}) {
  const userId = getUserId();
  const effectiveLimit = params.limit ?? 50;
  const effectiveOffset = params.offset ?? 0;
  const effectiveIncludeSets = params.include_sets ?? true;
  const period = params.period ?? "week";

  const queryParams: any[] = [userId];

  // Single workout mode
  if (params.workout_id != null) {
    queryParams.push(params.workout_id);

    const sql = `
      SELECT s.id as session_id, s.started_at, s.ended_at,
        pd.day_label as program_day, s.tags,
        COALESCE(json_agg(
          json_build_object(
            'exercise', e.name,
            'sets', (
              SELECT COALESCE(json_agg(
                json_build_object(
                  'set_id', st.id,
                  'set_number', st.set_number,
                  'reps', st.reps,
                  'weight', st.weight,
                  'rpe', st.rpe,
                  'set_type', st.set_type,
                  'notes', st.notes
                ) ORDER BY st.set_number
              ), '[]')
              FROM sets st WHERE st.session_exercise_id = se.id
            )
          ) ORDER BY se.sort_order
        ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
      FROM sessions s
      LEFT JOIN program_days pd ON pd.id = s.program_day_id
      LEFT JOIN session_exercises se ON se.session_id = s.id
      LEFT JOIN exercises e ON e.id = se.exercise_id
      WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.id = $2
      GROUP BY s.id, pd.day_label, s.tags`;

    const { rows: sessions } = await pool.query(sql, queryParams);
    return { sessions, summary: { total_sessions: sessions.length } };
  }

  // Date filter
  const userDate = await getUserCurrentDate();
  let dateFilter: string;

  if (period === "today") {
    queryParams.push(userDate);
    dateFilter = `s.started_at >= $${queryParams.length}::date`;
  } else if (period === "week") {
    queryParams.push(userDate);
    dateFilter = `s.started_at >= $${queryParams.length}::date - INTERVAL '7 days'`;
  } else if (period === "month") {
    queryParams.push(userDate);
    dateFilter = `s.started_at >= $${queryParams.length}::date - INTERVAL '30 days'`;
  } else if (period === "year") {
    queryParams.push(userDate);
    dateFilter = `s.started_at >= $${queryParams.length}::date - INTERVAL '365 days'`;
  } else {
    queryParams.push(userDate);
    queryParams.push(period);
    dateFilter = `s.started_at >= $${queryParams.length - 1}::date - make_interval(days => $${queryParams.length})`;
  }

  // Extra filters
  let extraWhere = "";

  if (params.exercise) {
    queryParams.push(`%${escapeIlike(params.exercise)}%`);
    extraWhere += ` AND EXISTS (
      SELECT 1 FROM session_exercises se2
      JOIN exercises e2 ON e2.id = se2.exercise_id
      WHERE se2.session_id = s.id AND e2.name ILIKE $${queryParams.length}
    )`;
  }

  if (params.program_day) {
    queryParams.push(params.program_day.toLowerCase());
    extraWhere += ` AND LOWER(pd.day_label) = $${queryParams.length}`;
  }

  if (params.tags && params.tags.length > 0) {
    queryParams.push(params.tags);
    extraWhere += ` AND s.tags @> $${queryParams.length}::text[]`;
  }

  queryParams.push(effectiveLimit);
  const limitIdx = queryParams.length;
  queryParams.push(effectiveOffset);
  const offsetIdx = queryParams.length;

  const sql = `
    SELECT s.id as session_id, s.started_at, s.ended_at,
      pd.day_label as program_day, s.tags,
      COALESCE(json_agg(
        json_build_object(
          'exercise', e.name,
          'sets', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'set_id', st.id,
                'set_number', st.set_number,
                'reps', st.reps,
                'weight', st.weight,
                'rpe', st.rpe,
                'set_type', st.set_type
              ) ORDER BY st.set_number
            ), '[]')
            FROM sets st WHERE st.session_exercise_id = se.id
          )
        ) ORDER BY se.sort_order
      ) FILTER (WHERE se.id IS NOT NULL), '[]') as exercises
    FROM sessions s
    LEFT JOIN program_days pd ON pd.id = s.program_day_id
    LEFT JOIN session_exercises se ON se.session_id = s.id
    LEFT JOIN exercises e ON e.id = se.exercise_id
    WHERE s.user_id = $1 AND s.deleted_at IS NULL AND ${dateFilter}${extraWhere}
    GROUP BY s.id, pd.day_label, s.tags
    ORDER BY s.started_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

  const { rows: sessions } = await pool.query(sql, queryParams);

  // Calculate summary
  let totalVolume = 0;
  const exerciseSet = new Set<string>();
  for (const session of sessions) {
    for (const ex of session.exercises || []) {
      if (ex.exercise) exerciseSet.add(ex.exercise);
      for (const set of ex.sets || []) {
        if (set.weight && set.reps && set.set_type !== "warmup") {
          totalVolume += set.weight * set.reps;
        }
      }
    }
  }

  return {
    sessions,
    summary: {
      total_sessions: sessions.length,
      total_volume_kg: Math.round(totalVolume),
      exercises_count: exerciseSet.size,
    }
  };
}

export async function deleteWorkoutsBulk(ids: number[]) {
  const userId = getUserId();

  if (!ids || ids.length === 0) {
    throw new Error("No workout IDs provided");
  }

  const numericIds = ids.map(id => Number(id)).filter(id => !Number.isNaN(id));
  if (numericIds.length === 0) {
    throw new Error("No valid workout IDs provided");
  }

  const { rows } = await pool.query(
    `UPDATE sessions SET deleted_at = NOW()
     WHERE id = ANY($1::int[]) AND user_id = $2 AND deleted_at IS NULL
     RETURNING id, started_at`,
    [numericIds, userId]
  );

  const deleted = rows.map((r: { id: number; started_at: Date }) => ({
    id: r.id,
    date: r.started_at.toISOString().split("T")[0],
  }));

  const notFound = numericIds.filter(id => !deleted.some(d => d.id === id));

  return {
    deleted,
    deleted_count: deleted.length,
    not_found: notFound.length > 0 ? notFound : undefined,
  };
}

export async function deleteWorkout(selector: string | number) {
  const userId = getUserId();
  const userDate = await getUserCurrentDate();

  // Resolve selector (ID, "today", "last", "yesterday", or YYYY-MM-DD)
  const resolved = await resolveWorkoutSelector(selector, userId, userDate);
  if (!resolved) {
    throw new Error(`Workout "${selector}" not found`);
  }

  // Get exercise count before deleting
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int as count FROM session_exercises WHERE session_id = $1`,
    [resolved.session_id]
  );

  // Soft delete
  await pool.query(
    "UPDATE sessions SET deleted_at = NOW() WHERE id = $1 AND user_id = $2",
    [resolved.session_id, userId]
  );

  return {
    deleted_workout: resolved.session_id,
    workout_date: resolved.started_at.toISOString().split("T")[0],
    exercises_count: countRows[0].count,
  };
}

export async function restoreWorkout(selector: string | number) {
  const userId = getUserId();
  const userDate = await getUserCurrentDate();

  // Resolve selector including deleted
  const resolved = await resolveWorkoutSelector(selector, userId, userDate, { includeDeleted: true });
  if (!resolved) {
    throw new Error(`Workout "${selector}" not found`);
  }
  if (!resolved.deleted_at) {
    throw new Error(`Workout is not deleted`);
  }

  await pool.query(
    "UPDATE sessions SET deleted_at = NULL WHERE id = $1 AND user_id = $2",
    [resolved.session_id, userId]
  );

  return {
    restored_workout: resolved.session_id,
    workout_date: resolved.started_at.toISOString().split("T")[0],
  };
}

/**
 * Resolves a workout selector to a session ID and metadata.
 */
async function resolveWorkoutSelector(
  selector: string | number,
  userId: number,
  userDate: string,
  options: { includeDeleted?: boolean } = {}
): Promise<{ session_id: number; started_at: Date; is_validated: boolean; deleted_at: Date | null } | null> {
  const { includeDeleted = false } = options;
  const deletedFilter = includeDeleted ? "" : "AND deleted_at IS NULL";

  // Numeric ID
  const numericId = Number(selector);
  if (!Number.isNaN(numericId) && String(selector).match(/^\d+$/)) {
    const { rows } = await pool.query(
      `SELECT id as session_id, started_at, is_validated, deleted_at
       FROM sessions WHERE id = $1 AND user_id = $2 ${deletedFilter}`,
      [numericId, userId]
    );
    return rows[0] || null;
  }

  // Semantic selectors
  let dateFilter: string;
  const params: (number | string)[] = [userId];

  switch (selector) {
    case "today":
      params.push(userDate);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
      break;
    case "yesterday": {
      const yesterday = new Date(userDate);
      yesterday.setDate(yesterday.getDate() - 1);
      params.push(yesterday.toISOString().split("T")[0]);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
      break;
    }
    case "last":
      dateFilter = "";
      break;
    default:
      // YYYY-MM-DD date string
      if (typeof selector !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(selector)) {
        return null;
      }
      params.push(selector);
      dateFilter = `AND started_at >= $2::date AND started_at < $2::date + INTERVAL '1 day'`;
  }

  const { rows } = await pool.query(
    `SELECT id as session_id, started_at, is_validated, deleted_at
     FROM sessions
     WHERE user_id = $1 ${deletedFilter} ${dateFilter}
     ORDER BY started_at DESC
     LIMIT 1`,
    params
  );

  return rows[0] || null;
}

export async function getTodayPlan() {
  const userId = getUserId();
  const activeProgram = await getActiveProgram();

  if (!activeProgram) {
    return { error: "No active program" };
  }

  const { rows: profileRows } = await pool.query(
    "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  const timezone = profileRows[0]?.timezone || undefined;

  const dayInfo = await inferTodayDay(activeProgram.id, timezone);
  if (!dayInfo) {
    return { error: "No day scheduled for today" };
  }

  const { rows: exercises } = await pool.query(
    `SELECT e.name, pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe, pde.rest_seconds, pde.notes
     FROM program_day_exercises pde
     JOIN exercises e ON e.id = pde.exercise_id
     WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
    [dayInfo.id]
  );

  return {
    day_label: dayInfo.day_label,
    exercises,
  };
}

// ============================================================================
// STATS
// ============================================================================

export async function getStats(params: { exercise?: string; exercises?: string[]; period?: string }) {
  const userId = getUserId();
  const period = params.period || "month";
  const exerciseNames = params.exercises || (params.exercise ? [params.exercise] : []);

  if (exerciseNames.length === 0) {
    throw new Error("Specify exercise or exercises");
  }

  const userDate = await getUserCurrentDate();
  let dateFilter: string;
  const queryParams: any[] = [userId, userDate];

  if (period === "week") {
    dateFilter = "s.started_at >= $2::date - INTERVAL '7 days'";
  } else if (period === "month") {
    dateFilter = "s.started_at >= $2::date - INTERVAL '30 days'";
  } else if (period === "3months") {
    dateFilter = "s.started_at >= $2::date - INTERVAL '90 days'";
  } else if (period === "year") {
    dateFilter = "s.started_at >= $2::date - INTERVAL '365 days'";
  } else {
    dateFilter = "1=1";
  }

  const stats: Record<string, any> = {};

  for (const name of exerciseNames) {
    const exercise = await findExercise(name);
    if (!exercise) {
      stats[name] = { error: "Exercise not found" };
      continue;
    }

    // Get PRs
    const { rows: prs } = await pool.query(
      `SELECT record_type, value FROM personal_records WHERE user_id = $1 AND exercise_id = $2`,
      [userId, exercise.id]
    );

    // Get recent sets
    const { rows: sets } = await pool.query(
      `SELECT st.reps, st.weight, st.rpe, s.started_at
       FROM sets st
       JOIN session_exercises se ON se.id = st.session_exercise_id
       JOIN sessions s ON s.id = se.session_id
       WHERE s.user_id = $1 AND se.exercise_id = $3 AND s.deleted_at IS NULL AND ${dateFilter}
       ORDER BY s.started_at DESC`,
      [userId, userDate, exercise.id]
    );

    // Calculate stats
    const totalSets = sets.length;
    const totalReps = sets.reduce((acc, s) => acc + (s.reps || 0), 0);
    const totalVolume = sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
    const maxWeight = Math.max(...sets.map(s => s.weight || 0), 0);
    const avgRPE = sets.filter(s => s.rpe).length > 0
      ? sets.filter(s => s.rpe).reduce((acc, s) => acc + s.rpe, 0) / sets.filter(s => s.rpe).length
      : null;

    stats[name] = {
      personal_records: prs.reduce((acc, pr) => ({ ...acc, [pr.record_type]: pr.value }), {}),
      period_stats: {
        total_sets: totalSets,
        total_reps: totalReps,
        total_volume_kg: Math.round(totalVolume),
        max_weight: maxWeight,
        avg_rpe: avgRPE ? Math.round(avgRPE * 10) / 10 : null,
      }
    };
  }

  return { stats };
}

// ============================================================================
// MEASUREMENTS
// ============================================================================

export async function logMeasurement(params: {
  type: string;
  value: number;
  measured_at?: string;
  notes?: string;
}) {
  const userId = getUserId();

  const { rows: [measurement] } = await pool.query(
    `INSERT INTO body_measurements (user_id, measurement_type, value, measured_at, notes)
     VALUES ($1, $2, $3, COALESCE($4::timestamp, NOW()), $5)
     RETURNING id, measurement_type, value, measured_at, notes`,
    [userId, params.type, params.value, params.measured_at || null, params.notes || null]
  );

  return { measurement };
}

export async function getMeasurements(params: { type?: string; period?: number; limit?: number }) {
  const userId = getUserId();
  const effectiveLimit = params.limit ?? 100;

  const queryParams: any[] = [userId];
  let whereExtra = "";

  if (params.type) {
    queryParams.push(params.type);
    whereExtra += ` AND measurement_type = $${queryParams.length}`;
  }

  if (params.period) {
    queryParams.push(params.period);
    whereExtra += ` AND measured_at >= NOW() - make_interval(days => $${queryParams.length})`;
  }

  queryParams.push(effectiveLimit);

  const { rows } = await pool.query(
    `SELECT id, measurement_type, value, measured_at, notes
     FROM body_measurements
     WHERE user_id = $1${whereExtra}
     ORDER BY measured_at DESC
     LIMIT $${queryParams.length}`,
    queryParams
  );

  return { measurements: rows };
}

export async function getLatestMeasurements() {
  const userId = getUserId();

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (measurement_type)
       id, measurement_type, value, measured_at, notes
     FROM body_measurements
     WHERE user_id = $1
     ORDER BY measurement_type, measured_at DESC`,
    [userId]
  );

  return { measurements: rows };
}
