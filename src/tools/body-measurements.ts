import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { getUserCurrentDate } from "../helpers/date-helpers.js";
import { toolResponse } from "../helpers/tool-response.js";

export function registerBodyMeasurementsTool(server: McpServer) {
  server.registerTool(
    "manage_body_measurements",
    {
      title: "Body Measurements",
      description: `Track body measurements over time. Use action "log" to record a measurement, "history" to see trends for a specific type, "latest" to get the most recent value of each type.

Common types: weight_kg, body_fat_pct, chest_cm, waist_cm, arm_cm, thigh_cm — or any custom type.

Examples:
- "peso 82kg" → log, measurement_type: "weight_kg", value: 82
- "historial de peso" → history, measurement_type: "weight_kg"
- "mis medidas actuales" → latest`,
      inputSchema: {
        action: z.enum(["log", "history", "latest"]),
        measurement_type: z.string().optional().describe("Type: weight_kg, body_fat_pct, chest_cm, waist_cm, arm_cm, thigh_cm, or any custom type"),
        value: z.number().optional().describe("Measurement value for log action"),
        measured_at: z.string().optional().describe("ISO date for measurement. Defaults to now"),
        notes: z.string().optional().describe("Optional notes for log action"),
        period: z.enum(["month", "3months", "6months", "year", "all"]).optional().describe("Time period for history action. Defaults to 3months"),
        limit: z.number().int().optional().describe("Max data points for history. Defaults to 50"),
      },
      annotations: {},
      _meta: {
        ui: { resourceUri: "ui://gym-tracker/measurements.html" },
        "openai/outputTemplate": "ui://gym-tracker/measurements.html",
        "openai/toolInvocation/invoking": "Managing measurements\u2026",
        "openai/toolInvocation/invoked": "Done",
      },
    },
    async ({ action, measurement_type, value, measured_at, notes, period, limit }) => {
      const userId = getUserId();

      if (action === "log") {
        if (!measurement_type) {
          return toolResponse({ error: "measurement_type is required for log action" }, true);
        }
        if (value === undefined || value === null) {
          return toolResponse({ error: "value is required for log action" }, true);
        }

        const measuredAtDate = measured_at ? new Date(measured_at + 'T00:00:00') : new Date();
        const { rows } = await pool.query(
          `INSERT INTO body_measurements (user_id, measurement_type, value, measured_at, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [userId, measurement_type, value, measuredAtDate, notes || null]
        );

        // Get previous measurement for comparison
        const { rows: prevRows } = await pool.query(
          `SELECT value, measured_at FROM body_measurements
           WHERE user_id = $1 AND measurement_type = $2 AND id != $3
           ORDER BY measured_at DESC LIMIT 1`,
          [userId, measurement_type, rows[0].id]
        );

        const result: any = {
          logged: rows[0],
        };
        if (prevRows.length > 0) {
          const change = value - Number(prevRows[0].value);
          result.previous = {
            value: Number(prevRows[0].value),
            measured_at: prevRows[0].measured_at,
            change: Math.round(change * 100) / 100,
          };
        }

        return toolResponse(result);
      }

      if (action === "history") {
        if (!measurement_type) {
          return toolResponse({ error: "measurement_type is required for history action" }, true);
        }

        const effectivePeriod = period || "3months";
        const effectiveLimit = limit || 50;

        const userDate = await getUserCurrentDate();
        let dateFilter = "";
        const hasDateFilter = effectivePeriod !== "all";
        switch (effectivePeriod) {
          case "month":
            dateFilter = "AND measured_at >= $3::date - INTERVAL '30 days'";
            break;
          case "3months":
            dateFilter = "AND measured_at >= $3::date - INTERVAL '90 days'";
            break;
          case "6months":
            dateFilter = "AND measured_at >= $3::date - INTERVAL '180 days'";
            break;
          case "year":
            dateFilter = "AND measured_at >= $3::date - INTERVAL '365 days'";
            break;
          default:
            dateFilter = "";
        }

        const queryParams: any[] = hasDateFilter
          ? [userId, measurement_type, userDate, effectiveLimit]
          : [userId, measurement_type, effectiveLimit];
        const limitParam = hasDateFilter ? "$4" : "$3";

        const { rows } = await pool.query(
          `SELECT value, measured_at, notes FROM body_measurements
           WHERE user_id = $1 AND measurement_type = $2 ${dateFilter}
           ORDER BY measured_at DESC LIMIT ${limitParam}`,
          queryParams
        );

        // Calculate stats
        let stats: any = null;
        if (rows.length > 0) {
          const values = rows.map((r) => Number(r.value));
          const min = Math.min(...values);
          const max = Math.max(...values);
          const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
          // Change: oldest vs newest in the returned data
          const oldest = values[values.length - 1];
          const newest = values[0];
          const change = Math.round((newest - oldest) * 100) / 100;

          stats = { min, max, average: avg, change, data_points: rows.length };
        }

        return toolResponse({ measurement_type, period: effectivePeriod, stats, history: rows });
      }

      // latest
      if (measurement_type) {
        const { rows } = await pool.query(
          `SELECT measurement_type, value, measured_at, notes
           FROM body_measurements
           WHERE user_id = $1 AND measurement_type = $2
           ORDER BY measured_at DESC LIMIT 1`,
          [userId, measurement_type]
        );

        return toolResponse({ latest: rows[0] || null });
      }

      const { rows } = await pool.query(
        `SELECT DISTINCT ON (measurement_type) measurement_type, value, measured_at, notes
         FROM body_measurements WHERE user_id = $1
         ORDER BY measurement_type, measured_at DESC`,
        [userId]
      );

      return toolResponse({ latest: rows });
    }
  );
}
