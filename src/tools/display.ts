import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

export function registerDisplayTools(server: McpServer) {
  registerAppToolWithMeta(server, "show_profile", {
    title: "Show Profile",
    description: "Display the user's profile as a visual card. Call this when the user wants to SEE their profile. For reading/updating profile data programmatically, use manage_profile instead.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: "ui://gym-tracker/profile.html" } },
  }, async () => {
    const userId = getUserId();
    const { rows } = await pool.query(
      "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1", [userId]
    );
    const profile = rows[0]?.data || {};
    return widgetResponse(
      profile.name ? `Profile for ${profile.name}.` : "Profile is empty.",
      { profile }
    );
  });
}
