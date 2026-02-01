import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, APP_CONTEXT } from "../helpers/tool-response.js";
import { getActiveProgram, getProgramDaysWithExercises } from "../helpers/program-helpers.js";

export function registerDisplayTools(server: McpServer) {
  registerAppToolWithMeta(server, "show_profile", {
    title: "Show Profile",
    description: `${APP_CONTEXT}Display the user's profile as a visual card with inline editing. Used both for viewing existing profiles and for new user setup — the widget handles empty/partial profiles gracefully with placeholder fields. The widget already shows all profile fields visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps. For reading/updating profile data programmatically, use manage_profile instead.`,
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://gym-tracker/profile.html" } },
  }, async () => {
    const userId = getUserId();
    const { rows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = rows[0]?.data || {};
    const fields = Object.keys(profile).filter(k => profile[k] != null).join(", ") || "none";
    return widgetResponse(
      `Profile widget displayed to user showing: ${fields}. Do NOT repeat this information in your response — the user can already see it. Just offer next steps or ask if they want to change anything.`,
      { profile }
    );
  });

  registerAppToolWithMeta(server, "show_programs", {
    title: "Programs List",
    description: `${APP_CONTEXT}Display a programs list widget showing the user's existing programs and global program templates.
The widget shows both user programs (with activate/deactivate) and global templates (with "Use this program" to clone).
Users can clone a global program or choose to build a custom one via chat.
The widget already shows all information visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps.
Call this when the user has a profile but no active program, or when they want to browse/manage their programs.
If the user chooses "Custom program", help them build one via manage_program create action.`,
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://gym-tracker/programs-list.html" } },
  }, async () => {
    const userId = getUserId();

    // Fetch profile
    const { rows: profileRows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = profileRows[0]?.data || {};

    // Fetch user's programs with latest version_id
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

    // Fetch full exercise data for each user program
    const programsWithDays = await Promise.all(
      programRows.map(async (p) => ({
        id: p.id,
        name: p.name,
        is_active: p.is_active,
        description: p.description,
        version: p.version_number,
        days: await getProgramDaysWithExercises(p.version_id),
      }))
    );

    // Fetch global programs (templates) with full exercise data
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

    const globalPrograms = await Promise.all(
      globalRows.map(async (p) => {
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

    return widgetResponse(
      `Programs list widget displayed showing ${programsWithDays.length} user program(s) and ${globalPrograms.length} global template(s). Do NOT repeat this information — the user can see it in the widget. If user chooses "Custom program", help them build one via manage_program create.`,
      { profile, programs: programsWithDays, globalPrograms }
    );
  });

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
    description: `${APP_CONTEXT}Display a workout program as a visual widget with inline editing. All fields (name, description, days, exercises, sets, reps, weight, RPE, rest) are editable in-place with auto-save. The widget shows the full program structure — do NOT repeat exercises or program details in your response. Just confirm it's displayed or offer next steps.
Use this whenever the user asks to see/show/edit their program, routine, or plan.
Defaults to the active program. Pass a name to show a specific program.
Pass "day" to scroll to a specific day (e.g. "lunes", "Dia 2", "monday"). The widget always receives all days for editing.`,
    inputSchema: {
      name: z.string().optional().describe("Program name. Omit for active program."),
      day: z.string().optional().describe("Scroll to a specific day. Accepts day label (e.g. 'Dia 1'), weekday name (e.g. 'lunes', 'monday'), or weekday number (1=Mon..7=Sun)."),
    },
    annotations: {},
    _meta: { ui: { resourceUri: "ui://gym-tracker/programs.html" } },
  }, async ({ name, day }: { name?: string; day?: string }) => {
    const userId = getUserId();

    const program = name
      ? await pool
          .query(
            `SELECT p.id, p.name, p.description, pv.id as version_id, pv.version_number
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

    const totalExercises = days.reduce((sum: number, d: any) => sum + d.exercises.length, 0);

    // Fetch exercise catalog for autocomplete in the widget
    const { rows: exerciseRows } = await pool.query(
      `SELECT name, muscle_group FROM exercises
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY user_id NULLS LAST, name`,
      [userId]
    );

    return widgetResponse(
      `Program widget displayed showing "${program.name}" (v${program.version_number}, ${days.length} day${days.length > 1 ? "s" : ""}, ${totalExercises} exercises). The widget supports inline editing — do NOT repeat this information.`,
      {
        program: {
          id: program.id,
          name: program.name,
          description: program.description,
          version: program.version_number,
          days,
        },
        initialDayIdx,
        exerciseCatalog: exerciseRows.map((r: any) => ({ name: r.name, muscle_group: r.muscle_group })),
      }
    );
  });
}
