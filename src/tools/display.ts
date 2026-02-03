import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { getActiveProgram, getProgramDaysWithExercises } from "../helpers/program-helpers.js";
import { parseJsonArrayParam, escapeIlike } from "../helpers/parse-helpers.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";

export function registerDisplayTools(server: McpServer) {
  registerAppToolWithMeta(server, "show_profile", {
    title: "Show Profile",
    description: `${APP_CONTEXT}Display the user's profile as a read-only card. The widget shows all profile fields visually — do NOT repeat the data in your response.
To propose changes, pass pending_changes with the fields to update. The widget shows a visual diff (old → new) and a "Confirm" button. The user reviews and confirms in the widget — do NOT apply changes yourself.
Examples: user says "peso 85kg" → call show_profile({ pending_changes: { weight_kg: 85 } }). User says "cambié de gym a Iron Paradise y mi goal ahora es endurance" → call show_profile({ pending_changes: { gym: "Iron Paradise", goals: ["endurance"] } }).
Without pending_changes: read-only view. With pending_changes: diff view + confirm button. Wait for the user to confirm before proceeding.`,
    inputSchema: {
      pending_changes: z.record(z.any()).optional()
        .describe("Fields to propose changing. Widget shows visual diff with confirm button. Omit for read-only view."),
    },
    annotations: { readOnlyHint: false },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/profile.html" },
      "openai/toolInvocation/invoking": "Loading profile...",
      "openai/toolInvocation/invoked": "Profile loaded",
    },
  }, safeHandler("show_profile", async ({ pending_changes }: { pending_changes?: Record<string, any> }) => {
    const userId = getUserId();
    const { rows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = rows[0]?.data || {};
    const hasPending = pending_changes && Object.keys(pending_changes).length > 0;
    const llmNote = hasPending
      ? `Profile widget displayed with proposed changes. Wait for the user to confirm or reject in the widget. Do NOT describe or list any data.`
      : `Profile widget displayed. The user can already see all their data visually. Do NOT describe, list, or summarize any profile information in text. Just acknowledge it's shown and offer to help with changes.`;
    return widgetResponse(
      llmNote,
      { profile, ...(hasPending ? { pendingChanges: pending_changes } : {}) }
    );
  }));

  registerAppToolWithMeta(server, "show_programs", {
    title: "My Programs",
    description: `${APP_CONTEXT}Display programs as a visual list widget.
- mode="user" (default): Show user's programs with Active/Inactive status.
- mode="available": Show global templates with Recommended/Already added badges and clone action.
The widget already shows all information visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps.
Call with mode="user" when the user wants to see their programs. Call with mode="available" to browse global templates.
To edit programs, use manage_program. After a clone from available mode, follow up with show_program.`,
    inputSchema: {
      mode: z.enum(["user", "available"]).optional().default("user")
        .describe("user = show user's programs. available = browse global templates."),
      filter: z.union([z.array(z.string()), z.string()]).optional()
        .describe("(available mode only) Program names to show from global templates. If omitted, returns all."),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/programs-list.html" },
      "openai/toolInvocation/invoking": "Loading programs...",
      "openai/toolInvocation/invoked": "Programs loaded",
    },
  }, safeHandler("show_programs", async (args: { mode?: "user" | "available"; filter?: string[] | string } = {}) => {
    const { mode, filter } = args;
    const userId = getUserId();
    const effectiveMode = mode ?? "user";

    if (effectiveMode === "available") {
      // === Available mode: global templates ===
      const { rows: profileRows } = await pool.query(
        "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
      );
      const profile = profileRows[0]?.data || {};

      const { rows: userProgramRows } = await pool.query(
        "SELECT name FROM programs WHERE user_id = $1", [userId]
      );

      const { rows: globalRows } = await pool.query(
        `SELECT * FROM (
           SELECT DISTINCT ON (p.id) p.id, p.name, p.description,
                  pv.id as version_id, pv.version_number
           FROM programs p
           JOIN program_versions pv ON pv.program_id = p.id
           WHERE p.user_id IS NULL
           ORDER BY p.id, pv.version_number DESC
         ) sub ORDER BY name`
      );

      const parsedFilter = parseJsonArrayParam<string>(filter);
      const filteredGlobalRows = parsedFilter
        ? globalRows.filter((p) => parsedFilter.some((f) => f.toLowerCase() === p.name.toLowerCase()))
        : globalRows;

      const programs = await Promise.all(
        filteredGlobalRows.map(async (p) => {
          const days = await getProgramDaysWithExercises(p.version_id);
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            version: p.version_number,
            days_per_week: days.length,
            days,
          };
        })
      );

      const userProgramNamesLower = userProgramRows.map((p) => p.name.toLowerCase());
      const clonedNames = programs
        .filter((g) => userProgramNamesLower.includes(g.name.toLowerCase()))
        .map((g) => g.name);

      return widgetResponse(
        `Available programs widget displayed. The user can browse templates visually. Do NOT describe, list, or summarize any program information. After a clone, follow up with show_program.`,
        { mode: "available", programs, profile, clonedNames }
      );
    }

    // === User mode: user's programs ===
    const { rows: programRows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (p.id) p.id, p.name, p.is_active, p.description,
                pv.id as version_id, pv.version_number
         FROM programs p
         JOIN program_versions pv ON pv.program_id = p.id
         WHERE p.user_id = $1
         ORDER BY p.id, pv.version_number DESC
       ) sub ORDER BY is_active DESC, name`,
      [userId]
    );

    const programs = await Promise.all(
      programRows.map(async (p) => ({
        id: p.id,
        name: p.name,
        is_active: p.is_active,
        description: p.description,
        version: p.version_number,
        days: await getProgramDaysWithExercises(p.version_id),
      }))
    );

    return widgetResponse(
      `Programs list widget displayed. The user can see all their programs visually. Do NOT describe, list, or summarize any program information in text.`,
      { mode: "user", programs }
    );
  }));

  registerAppToolWithMeta(server, "show_available_programs", {
    title: "Available Programs",
    description: `${APP_CONTEXT}Display global program templates for browsing and cloning.
DEPRECATED: Use show_programs({ mode: "available" }) instead. This tool is kept for backwards compatibility.`,
    inputSchema: {
      filter: z.union([z.array(z.string()), z.string()]).optional()
        .describe("Program names to show from global templates. If omitted, returns all global programs."),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/programs-list.html" },
      "openai/toolInvocation/invoking": "Loading programs...",
      "openai/toolInvocation/invoked": "Programs loaded",
    },
  }, safeHandler("show_available_programs", async ({ filter }: { filter?: string[] | string }) => {
    // Delegate to show_programs with mode="available"
    const userId = getUserId();

    const { rows: profileRows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = profileRows[0]?.data || {};

    const { rows: userProgramRows } = await pool.query(
      "SELECT name FROM programs WHERE user_id = $1", [userId]
    );

    const { rows: globalRows } = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (p.id) p.id, p.name, p.description,
                pv.id as version_id, pv.version_number
         FROM programs p
         JOIN program_versions pv ON pv.program_id = p.id
         WHERE p.user_id IS NULL
         ORDER BY p.id, pv.version_number DESC
       ) sub ORDER BY name`
    );

    const parsedFilter = parseJsonArrayParam<string>(filter);
    const filteredGlobalRows = parsedFilter
      ? globalRows.filter((p) => parsedFilter.some((f) => f.toLowerCase() === p.name.toLowerCase()))
      : globalRows;

    const programs = await Promise.all(
      filteredGlobalRows.map(async (p) => {
        const days = await getProgramDaysWithExercises(p.version_id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          version: p.version_number,
          days_per_week: days.length,
          days,
        };
      })
    );

    const userProgramNamesLower = userProgramRows.map((p) => p.name.toLowerCase());
    const clonedNames = programs
      .filter((g) => userProgramNamesLower.includes(g.name.toLowerCase()))
      .map((g) => g.name);

    return widgetResponse(
      `Available programs widget displayed. The user can browse templates visually. Do NOT describe, list, or summarize any program information. After a clone, follow up with show_program.`,
      { mode: "available", programs, profile, clonedNames }
    );
  }));

  const WEEKDAY_NAMES: Record<string, number> = {
    lunes: 1, monday: 1, mon: 1, lu: 1,
    martes: 2, tuesday: 2, tue: 2, ma: 2,
    miercoles: 3, miércoles: 3, wednesday: 3, wed: 3, mi: 3,
    jueves: 4, thursday: 4, thu: 4, ju: 4,
    viernes: 5, friday: 5, fri: 5, vi: 5,
    sabado: 6, sábado: 6, saturday: 6, sat: 6, sa: 6,
    domingo: 7, sunday: 7, sun: 7, do: 7,
  };

  registerAppToolWithMeta(server, "show_program", {
    title: "Show Program",
    description: `${APP_CONTEXT}Display a workout program as a read-only visual widget. Shows the full program structure with days, exercises, sets, reps, weight, RPE, and rest — do NOT repeat exercises or program details in your response. Just confirm it's displayed or offer next steps.
To propose metadata changes (name, description), pass pending_changes. The widget shows a visual diff and a "Confirm" button. Wait for the user to confirm.
For structural changes (days, exercises, sets), use manage_program then re-render with show_program.
Use this whenever the user asks to see/show their program, routine, or plan.
Defaults to the active program. Pass a name to show a specific program.
Pass "day" to scroll to a specific day (e.g. "lunes", "Dia 2", "monday").`,
    inputSchema: {
      name: z.string().optional().describe("Program name. Omit for active program."),
      day: z.string().optional().describe("Scroll to a specific day. Accepts day label (e.g. 'Dia 1'), weekday name (e.g. 'lunes', 'monday'), or weekday number (1=Mon..7=Sun)."),
      pending_changes: z.record(z.any()).optional()
        .describe("Fields to propose changing (name, description). Widget shows visual diff with confirm button. Omit for read-only view."),
    },
    annotations: { readOnlyHint: false },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/programs.html" },
      "openai/toolInvocation/invoking": "Loading program...",
      "openai/toolInvocation/invoked": "Program loaded",
    },
  }, safeHandler("show_program", async ({ name, day, pending_changes }: { name?: string; day?: string; pending_changes?: Record<string, any> }) => {
    const userId = getUserId();

    const program = name
      ? await pool
          .query(
            `SELECT p.id, p.name, p.description, p.is_active, pv.id as version_id, pv.version_number
             FROM programs p JOIN program_versions pv ON pv.program_id = p.id
             WHERE p.user_id = $1 AND LOWER(p.name) = LOWER($2)
             ORDER BY pv.version_number DESC LIMIT 1`,
            [userId, name]
          )
          .then(r => r.rows[0])
      : await getActiveProgram();

    if (!program) {
      return widgetResponse(
        "No program found. The user doesn't have an active program — suggest creating one.",
        { program: null }
      );
    }

    const days = await getProgramDaysWithExercises(program.version_id);

    // Find initial day index if day filter is provided (widget scrolls to it)
    let initialDayIdx = 0;
    if (day) {
      const dayLower = day.trim().toLowerCase();
      const matchIdx = days.findIndex((d: any) => {
        if (d.day_label.toLowerCase().includes(dayLower)) return true;
        const weekdayNum = WEEKDAY_NAMES[dayLower];
        if (weekdayNum && d.weekdays?.includes(weekdayNum)) return true;
        const num = parseInt(dayLower, 10);
        if (!isNaN(num) && d.weekdays?.includes(num)) return true;
        return false;
      });
      if (matchIdx >= 0) initialDayIdx = matchIdx;
    }

    const hasPending = pending_changes && Object.keys(pending_changes).length > 0;
    const llmNote = hasPending
      ? `Program widget displayed with proposed changes. Wait for the user to confirm or reject in the widget. Do NOT describe or list any data.`
      : `Program widget displayed. The user can see the full program visually. Do NOT describe, list, or summarize any program details in text.`;

    return widgetResponse(
      llmNote,
      {
        program: {
          id: program.id,
          name: program.name,
          description: program.description,
          version: program.version_number,
          is_active: program.is_active ?? false,
          days,
        },
        initialDayIdx,
        ...(hasPending ? { pendingChanges: pending_changes } : {}),
      }
    );
  }));

  registerAppToolWithMeta(server, "show_workouts", {
    title: "Workout History",
    description: `${APP_CONTEXT}Display workout history as a visual list with full session details.
The widget already shows all information visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps.
Use this when the user wants to see past workouts, training history, or review their sessions.`,
    inputSchema: {
      period: z
        .union([
          z.enum(["today", "week", "month", "year"]),
          z.number().int().min(1),
        ])
        .optional()
        .default("month"),
      exercise: z.string().optional().describe("Filter sessions containing this exercise"),
      program_day: z.string().optional().describe("Filter by program day label"),
      tags: z.union([z.array(z.string()), z.string()]).optional().describe("Filter sessions with ALL of these tags"),
      limit: z.number().int().optional().describe("Max sessions to return. Defaults to 20"),
      offset: z.number().int().optional().describe("Skip first N sessions for pagination. Defaults to 0"),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/workouts.html" },
      "openai/toolInvocation/invoking": "Loading workouts...",
      "openai/toolInvocation/invoked": "Workouts loaded",
    },
  }, safeHandler("show_workouts", async ({ period, exercise, program_day, tags: rawTags, limit: rawLimit, offset: rawOffset }: {
    period?: "today" | "week" | "month" | "year" | number;
    exercise?: string;
    program_day?: string;
    tags?: string[] | string;
    limit?: number;
    offset?: number;
  }) => {
    const tags = parseJsonArrayParam<string>(rawTags);
    const userId = getUserId();
    const effectiveLimit = rawLimit ?? 20;
    const effectiveOffset = rawOffset ?? 0;
    const effectivePeriod = period ?? "month";

    const params: any[] = [userId];

    // Build date filter
    const userDate = await getUserCurrentDate();
    let dateFilter: string;
    if (effectivePeriod === "today") {
      params.push(userDate);
      dateFilter = `s.started_at >= $${params.length}::date`;
    } else if (effectivePeriod === "week") {
      params.push(userDate);
      dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '7 days'`;
    } else if (effectivePeriod === "month") {
      params.push(userDate);
      dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '30 days'`;
    } else if (effectivePeriod === "year") {
      params.push(userDate);
      dateFilter = `s.started_at >= $${params.length}::date - INTERVAL '365 days'`;
    } else {
      params.push(userDate);
      params.push(effectivePeriod);
      dateFilter = `s.started_at >= $${params.length - 1}::date - make_interval(days => $${params.length})`;
    }

    // Build extra WHERE clauses
    let extraWhere = "";
    if (exercise) {
      params.push(`%${escapeIlike(exercise)}%`);
      extraWhere += ` AND EXISTS (
        SELECT 1 FROM session_exercises se2
        JOIN exercises e2 ON e2.id = se2.exercise_id
        LEFT JOIN exercise_aliases ea ON ea.exercise_id = e2.id
        WHERE se2.session_id = s.id
          AND (e2.name ILIKE $${params.length} OR ea.alias ILIKE $${params.length})
      )`;
    }
    if (program_day) {
      params.push(program_day.toLowerCase());
      extraWhere += ` AND LOWER(pd.day_label) = $${params.length}`;
    }
    if (tags && tags.length > 0) {
      params.push(tags);
      extraWhere += ` AND s.tags @> $${params.length}::text[]`;
    }

    params.push(effectiveLimit);
    const limitIdx = params.length;
    params.push(effectiveOffset);
    const offsetIdx = params.length;

    // Get sessions with summary
    const sql = `
      SELECT s.id as session_id, s.started_at, s.ended_at,
        pd.day_label as program_day, s.tags,
        COUNT(DISTINCT se.id) as exercises_count,
        COALESCE(SUM((SELECT COUNT(*) FROM sets st WHERE st.session_exercise_id = se.id)), 0) as total_sets,
        COALESCE(SUM((SELECT COALESCE(SUM(st.weight * st.reps), 0) FROM sets st WHERE st.session_exercise_id = se.id AND st.set_type != 'warmup' AND st.weight IS NOT NULL)), 0) as total_volume_kg,
        ARRAY_AGG(DISTINCT e.muscle_group) FILTER (WHERE e.muscle_group IS NOT NULL) as muscle_groups
      FROM sessions s
      LEFT JOIN program_days pd ON pd.id = s.program_day_id
      LEFT JOIN session_exercises se ON se.session_id = s.id
      LEFT JOIN exercises e ON e.id = se.exercise_id
      WHERE s.user_id = $1 AND s.deleted_at IS NULL AND ${dateFilter}${extraWhere}
      GROUP BY s.id, pd.day_label, s.tags
      ORDER BY s.started_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const { rows } = await pool.query(sql, params);

    // Fetch full exercise details for each session (like show_workout)
    const sessions = await Promise.all(rows.map(async (s) => {
      const durationMinutes = s.ended_at
        ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
        : Math.round((Date.now() - new Date(s.started_at).getTime()) / 60000);

      // Get exercises + sets (with group info, section info, muscle_group, rep_type)
      const { rows: exerciseDetails } = await pool.query(
        `SELECT e.id as exercise_id, e.name, se.group_id, seg.group_type, seg.label as group_label, seg.notes as group_notes, seg.rest_seconds as group_rest_seconds,
           se.section_id, ss.label as section_label, ss.notes as section_notes,
           e.muscle_group, e.exercise_type, e.rep_type,
           COALESCE(json_agg(json_build_object(
             'set_id', st.id, 'set_number', st.set_number, 'reps', st.reps, 'weight', st.weight,
             'rpe', st.rpe, 'set_type', st.set_type
           ) ORDER BY st.set_number) FILTER (WHERE st.id IS NOT NULL), '[]') as sets
         FROM session_exercises se
         JOIN exercises e ON e.id = se.exercise_id
         LEFT JOIN sets st ON st.session_exercise_id = se.id
         LEFT JOIN session_exercise_groups seg ON seg.id = se.group_id
         LEFT JOIN session_sections ss ON ss.id = se.section_id
         WHERE se.session_id = $1
         GROUP BY se.id, e.id, e.name, se.group_id, seg.group_type, seg.label, seg.notes, seg.rest_seconds, se.section_id, ss.label, ss.notes, se.sort_order, e.muscle_group, e.exercise_type, e.rep_type
         ORDER BY se.sort_order`,
        [s.session_id]
      );

      return {
        session_id: s.session_id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        duration_minutes: durationMinutes,
        program_day: s.program_day,
        tags: s.tags || [],
        exercises_count: Number(s.exercises_count),
        total_sets: Number(s.total_sets),
        total_volume_kg: Math.round(Number(s.total_volume_kg)),
        muscle_groups: s.muscle_groups || [],
        exercises: exerciseDetails.map((e: any) => ({
          name: e.name,
          exercise_id: e.exercise_id,
          group_id: e.group_id,
          group_type: e.group_type,
          group_label: e.group_label,
          group_notes: e.group_notes,
          group_rest_seconds: e.group_rest_seconds,
          section_id: e.section_id,
          section_label: e.section_label,
          section_notes: e.section_notes,
          muscle_group: e.muscle_group,
          exercise_type: e.exercise_type,
          rep_type: e.rep_type,
          sets: e.sets,
        })),
      };
    }));

    const summary = {
      total_sessions: sessions.length,
      total_volume_kg: sessions.reduce((acc, s) => acc + s.total_volume_kg, 0),
      exercises_count: sessions.reduce((acc, s) => acc + s.exercises_count, 0),
    };

    const periodStr = typeof effectivePeriod === "number" ? `${effectivePeriod}` : effectivePeriod;
    const filters = {
      period: periodStr,
      ...(exercise && { exercise }),
      ...(program_day && { program_day }),
      ...(tags && tags.length > 0 && { tags }),
    };

    return widgetResponse(
      `Workout history widget displayed. The user can see all sessions visually. Do NOT describe, list, or summarize any workout information in text.`,
      { sessions, summary, filters }
    );
  }));
}
