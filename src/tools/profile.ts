import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerProfileTool(server: McpServer) {
  server.tool(
    "manage_profile",
    `${APP_CONTEXT}Read or update user profile data. This is a data-only tool — no visual UI.
Use action "get" to retrieve the current profile (call this at conversation start for context).
Use action "update" to save user info. The data field merges with existing data.
When the user wants to SEE their profile visually, call show_profile instead.

Standard fields (always use these exact keys):
- name: string — display name
- age: number — years
- sex: "male" | "female"
- weight_kg: number
- height_cm: number
- goals: string[] — e.g. ["hypertrophy", "strength"]
- experience_level: "beginner" | "intermediate" | "advanced"
- training_days_per_week: number — e.g. 3
- available_days: string[] — e.g. ["monday", "wednesday", "friday"]
- injuries: string[] — e.g. ["left shoulder"]
- preferred_units: "kg" | "lb"
- gym: string — gym name
- supplements: string

Example: user says "peso 82kg" → update with { "weight_kg": 82 }
Example: user says "entreno lunes miercoles y viernes" → update with { "training_days_per_week": 3, "available_days": ["monday", "wednesday", "friday"] }`,
    {
      action: z.enum(["get", "update"]),
      data: z.record(z.any()).optional(),
    },
    async ({ action, data }) => {
      const userId = getUserId();

      if (action === "get") {
        const { rows } = await pool.query(
          "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        const profile = rows[0]?.data || {};

        return toolResponse({ profile });
      }

      // update
      if (!data || Object.keys(data).length === 0) {
        return toolResponse({ error: "No data provided" }, true);
      }

      const { rows } = await pool.query(
        `INSERT INTO user_profile (user_id, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET data = user_profile.data || EXCLUDED.data, updated_at = NOW()
         RETURNING data`,
        [userId, JSON.stringify(data)]
      );

      const updated = rows[0].data;
      return toolResponse({ profile: updated });
    }
  );
}
