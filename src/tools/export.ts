import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";

function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: Record<string, any>[]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvValue(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

export function registerExportTool(server: McpServer) {
  server.registerTool(
    "export_data",
    {
      description: `${APP_CONTEXT}Export user data as JSON or CSV. Use scope to choose what to export: all, sessions, exercises, programs, measurements, prs.

Examples:
- "exportar mis datos" → json, scope: "all"
- "csv de mis sesiones del último mes" → csv, scope: "sessions", period: "month"
- "descargar mis ejercicios" → json, scope: "exercises"`,
      inputSchema: {
        action: z.enum(["json", "csv"]),
        scope: z.enum(["all", "sessions", "exercises", "programs", "measurements", "prs"]).optional().describe("What data to export. Defaults to all"),
        period: z.enum(["month", "3months", "year", "all"]).optional().describe("Time period filter. Defaults to all"),
      },
      annotations: { readOnlyHint: true },
    },
    safeHandler("export_data", async ({ action, scope: rawScope, period: rawPeriod }) => {
      const userId = getUserId();
      const scope = rawScope || "all";
      const period = rawPeriod || "all";

      const userDate = await getUserCurrentDate();
      let dateFilter = "";
      const hasDateFilter = period !== "all";
      switch (period) {
        case "month":
          dateFilter = "AND s.started_at >= $2::date - INTERVAL '30 days'";
          break;
        case "3months":
          dateFilter = "AND s.started_at >= $2::date - INTERVAL '90 days'";
          break;
        case "year":
          dateFilter = "AND s.started_at >= $2::date - INTERVAL '365 days'";
          break;
        default:
          dateFilter = "";
      }

      const EXPORT_ROW_LIMIT = 10000;
      const data: Record<string, any> = {};
      const sessionParams: any[] = hasDateFilter ? [userId, userDate] : [userId];

      // Sessions
      if (scope === "all" || scope === "sessions") {
        const { rows } = await pool.query(
          `SELECT s.id as session_id, s.started_at, s.ended_at, s.tags,
            se.sort_order, e.name as exercise_name, e.muscle_group,
            st.set_number, st.reps, st.weight, st.rpe, st.set_type, st.notes
           FROM sessions s
           JOIN session_exercises se ON se.session_id = s.id
           JOIN exercises e ON e.id = se.exercise_id
           JOIN sets st ON st.session_exercise_id = se.id
           WHERE s.user_id = $1 AND s.deleted_at IS NULL ${dateFilter}
           ORDER BY s.started_at DESC, se.sort_order, st.set_number
           LIMIT ${EXPORT_ROW_LIMIT}`,
          sessionParams
        );
        data.sessions = rows;
      }

      // Exercises
      if (scope === "all" || scope === "exercises") {
        const { rows } = await pool.query(
          `SELECT e.name, e.muscle_group, e.equipment, e.rep_type, e.exercise_type, e.description,
            array_agg(DISTINCT ea.alias) FILTER (WHERE ea.alias IS NOT NULL) as aliases
           FROM exercises e
           LEFT JOIN exercise_aliases ea ON ea.exercise_id = e.id
           WHERE e.user_id = $1 OR e.user_id IS NULL
           GROUP BY e.id ORDER BY e.name
           LIMIT ${EXPORT_ROW_LIMIT}`,
          [userId]
        );
        data.exercises = rows;
      }

      // Programs
      if (scope === "all" || scope === "programs") {
        const { rows } = await pool.query(
          `SELECT p.name as program_name, p.is_active,
            pv.version_number, pd.day_label, pd.weekdays,
            e.name as exercise_name, pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe,
            pde.target_reps_per_set, pde.target_weight_per_set, pde.rest_seconds,
            peg.group_type, peg.label as group_label,
            ps.label as section_label, ps.notes as section_notes
           FROM programs p
           JOIN program_versions pv ON pv.program_id = p.id
           JOIN program_days pd ON pd.version_id = pv.id
           LEFT JOIN program_day_exercises pde ON pde.day_id = pd.id
           LEFT JOIN exercises e ON e.id = pde.exercise_id
           LEFT JOIN program_exercise_groups peg ON peg.id = pde.group_id
           LEFT JOIN program_sections ps ON ps.id = pde.section_id
           WHERE p.user_id = $1
           ORDER BY p.name, pv.version_number DESC, pd.day_label, pde.sort_order
           LIMIT ${EXPORT_ROW_LIMIT}`,
          [userId]
        );
        data.programs = rows;
      }

      // Measurements
      if (scope === "all" || scope === "measurements") {
        const { rows } = await pool.query(
          `SELECT measurement_type, value, measured_at, notes
           FROM body_measurements WHERE user_id = $1
           ORDER BY measurement_type, measured_at DESC
           LIMIT ${EXPORT_ROW_LIMIT}`,
          [userId]
        );
        data.measurements = rows;
      }

      // PRs
      if (scope === "all" || scope === "prs") {
        const { rows } = await pool.query(
          `SELECT e.name as exercise_name, pr.record_type, pr.value,
            (SELECT ph.achieved_at FROM pr_history ph
             WHERE ph.exercise_id = pr.exercise_id AND ph.record_type = pr.record_type AND ph.user_id = $1
             ORDER BY ph.achieved_at DESC LIMIT 1) as achieved_at
           FROM personal_records pr
           JOIN exercises e ON e.id = pr.exercise_id
           WHERE pr.user_id = $1
           ORDER BY e.name, pr.record_type
           LIMIT ${EXPORT_ROW_LIMIT}`,
          [userId]
        );
        data.prs = rows;
      }

      if (action === "json") {
        return toolResponse({ export: data });
      }

      // CSV
      const csvParts: string[] = [];

      if (data.sessions && data.sessions.length > 0) {
        const headers = ["session_id", "started_at", "ended_at", "tags", "sort_order", "exercise_name", "muscle_group", "set_number", "reps", "weight", "rpe", "set_type", "notes"];
        const sessionRows = data.sessions.map((r: any) => ({
          ...r,
          tags: r.tags ? r.tags.join(";") : "",
        }));
        csvParts.push("### SESSIONS ###\n" + toCsv(headers, sessionRows));
      }

      if (data.exercises && data.exercises.length > 0) {
        const headers = ["name", "muscle_group", "equipment", "rep_type", "exercise_type", "description", "aliases"];
        const exerciseRows = data.exercises.map((r: any) => ({
          ...r,
          aliases: r.aliases ? r.aliases.join(";") : "",
        }));
        csvParts.push("### EXERCISES ###\n" + toCsv(headers, exerciseRows));
      }

      if (data.programs && data.programs.length > 0) {
        const headers = ["program_name", "is_active", "version_number", "day_label", "weekdays", "exercise_name", "target_sets", "target_reps", "target_weight", "target_rpe", "target_reps_per_set", "target_weight_per_set", "rest_seconds", "group_type", "group_label", "section_label", "section_notes"];
        const programRows = data.programs.map((r: any) => ({
          ...r,
          weekdays: r.weekdays ? r.weekdays.join(";") : "",
          target_reps_per_set: r.target_reps_per_set ? r.target_reps_per_set.join(";") : "",
          target_weight_per_set: r.target_weight_per_set ? r.target_weight_per_set.join(";") : "",
        }));
        csvParts.push("### PROGRAMS ###\n" + toCsv(headers, programRows));
      }

      if (data.measurements && data.measurements.length > 0) {
        const headers = ["measurement_type", "value", "measured_at", "notes"];
        csvParts.push("### MEASUREMENTS ###\n" + toCsv(headers, data.measurements));
      }

      if (data.prs && data.prs.length > 0) {
        const headers = ["exercise_name", "record_type", "value", "achieved_at"];
        csvParts.push("### PERSONAL RECORDS ###\n" + toCsv(headers, data.prs));
      }

      const csvOutput = csvParts.join("\n\n");

      return { content: [{ type: "text" as const, text: csvOutput || "No data to export" }] };
    })
  );
}
