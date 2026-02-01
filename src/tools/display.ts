import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, APP_CONTEXT } from "../helpers/tool-response.js";
import { PROGRAM_TEMPLATES } from "../helpers/program-templates.js";
import { getActiveProgram, getProgramDaysWithExercises } from "../helpers/program-helpers.js";

export function registerDisplayTools(server: McpServer) {
  registerAppToolWithMeta(server, "show_profile", {
    title: "Show Profile",
    description: `${APP_CONTEXT}Display the user's profile as a visual card. The widget already shows all profile fields visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps. For reading/updating profile data programmatically, use manage_profile instead.`,
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

  registerAppToolWithMeta(server, "show_onboarding", {
    title: "Onboarding",
    description: `${APP_CONTEXT}Display the interactive onboarding widget for new users.
The widget handles profile setup and program selection internally — do NOT call manage_profile or manage_program yourself during onboarding.
Call this when initialize_gym_session returns is_new_user=true.
If the user selects "Custom program", help them build one via manage_program create action.`,
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://gym-tracker/onboarding.html" } },
  }, async () => {
    const userId = getUserId();
    const { rows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = rows[0]?.data || {};

    const templates = Object.entries(PROGRAM_TEMPLATES).map(([id, t]) => ({
      id, name: t.name, description: t.description,
      days_per_week: t.days_per_week, target_experience: t.target_experience,
      days: t.days.map(d => ({
        day_label: d.day_label,
        exercises: d.exercises.map(e => ({ name: e.exercise, sets: e.sets, reps: e.reps })),
      })),
    }));

    return widgetResponse(
      `Onboarding widget displayed. Your ONLY response should be a brief one-liner like "Completá el formulario para arrancar" or similar. Do NOT explain what the app does, do NOT list features, do NOT ask questions — the widget handles everything. If user later chooses "Custom program", help them build one via manage_program create.`,
      { profile, templates }
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
    description: `${APP_CONTEXT}Display a workout program as a visual widget with all days and exercises. The widget shows the full program structure — do NOT repeat exercises or program details in your response. Just confirm it's displayed or offer next steps.
Use this whenever the user asks to see/show their program, routine, or plan.
Defaults to the active program. Pass a name to show a specific program.
Pass "day" to show only a specific day (e.g. "lunes", "Dia 2", "monday"). Useful when user asks "show me Monday's routine".`,
    inputSchema: {
      name: z.string().optional().describe("Program name. Omit for active program."),
      day: z.string().optional().describe("Filter to a specific day. Accepts day label (e.g. 'Dia 1'), weekday name (e.g. 'lunes', 'monday'), or weekday number (1=Mon..7=Sun)."),
    },
    annotations: { readOnlyHint: true },
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

    let days = await getProgramDaysWithExercises(program.version_id);

    // Filter to a specific day if requested
    if (day) {
      const dayLower = day.trim().toLowerCase();
      const filtered = days.filter((d: any) => {
        // Match by day_label (e.g. "Dia 1", "Push A")
        if (d.day_label.toLowerCase().includes(dayLower)) return true;
        // Match by weekday name (e.g. "lunes", "monday")
        const weekdayNum = WEEKDAY_NAMES[dayLower];
        if (weekdayNum && d.weekdays?.includes(weekdayNum)) return true;
        // Match by weekday number
        const num = parseInt(dayLower, 10);
        if (!isNaN(num) && d.weekdays?.includes(num)) return true;
        return false;
      });
      if (filtered.length > 0) days = filtered;
    }

    const totalExercises = days.reduce((sum: number, d: any) => sum + d.exercises.length, 0);

    return widgetResponse(
      `Program widget displayed showing "${program.name}" (v${program.version_number}, ${days.length} day${days.length > 1 ? "s" : ""}, ${totalExercises} exercises). Do NOT repeat this information — the user can see it in the widget.`,
      {
        program: {
          name: program.name,
          description: program.description,
          version: program.version_number,
          days,
        },
      }
    );
  });
}
