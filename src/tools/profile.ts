import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

export function registerProfileTool(server: McpServer) {
  registerAppToolWithMeta(server,
    "manage_profile",
    {
      title: "Manage Profile",
      description: `Use this when you need to manage user profile data. Use action "get" to retrieve the current profile (call this at conversation start for context).
Use action "update" to save any user info like name, age, weight, height, goals, injuries, preferences.
The data field accepts any JSON object — it merges with existing data.
Example: user says "peso 82kg" → update with { "weight_kg": 82 }`,
      inputSchema: {
        action: z.enum(["get", "update"]),
        data: z.record(z.any()).optional(),
      },
      annotations: {},
      _meta: {
        ui: { resourceUri: "ui://gym-tracker/profile.html" },
        "openai/outputTemplate": "ui://gym-tracker/profile.html",
        "openai/toolInvocation/invoking": "Loading profile\u2026",
        "openai/toolInvocation/invoked": "Profile ready",
      },
    },
    async ({ action, data }) => {
      const userId = getUserId();

      if (action === "get") {
        const { rows } = await pool.query(
          "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        return toolResponse({ profile: rows[0]?.data || {} });
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

      return toolResponse({ profile: rows[0].data });
    }
  );
}
