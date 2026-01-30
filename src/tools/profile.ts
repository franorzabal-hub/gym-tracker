import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";

export function registerProfileTool(server: McpServer) {
  server.tool(
    "manage_profile",
    `Manage user profile data. Use action "get" to retrieve the current profile (call this at conversation start for context).
Use action "update" to save any user info like name, age, weight, height, goals, injuries, preferences.
The data field accepts any JSON object — it merges with existing data.
Example: user says "peso 82kg" → update with { "weight_kg": 82 }`,
    {
      action: z.enum(["get", "update"]),
      data: z.record(z.any()).optional(),
    },
    async ({ action, data }) => {
      if (action === "get") {
        const { rows } = await pool.query(
          "SELECT data FROM user_profile LIMIT 1"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ profile: rows[0]?.data || {} }),
            },
          ],
        };
      }

      // update
      if (!data || Object.keys(data).length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "No data provided" }) }],
          isError: true,
        };
      }

      const { rows } = await pool.query(
        `INSERT INTO user_profile (id, data, updated_at)
         VALUES (1, $1::jsonb, NOW())
         ON CONFLICT (id)
         DO UPDATE SET data = user_profile.data || EXCLUDED.data, updated_at = NOW()
         RETURNING data`,
        [JSON.stringify(data)]
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ profile: rows[0].data }),
          },
        ],
      };
    }
  );
}
