import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta } from "../helpers/tool-response.js";

export function registerDisplayTools(server: McpServer) {
  registerAppToolWithMeta(server, "show_profile", {
    title: "Show Profile",
    description: "Display the user's profile as a visual card. The widget already shows all profile fields visually — do NOT repeat the data in your response. Just confirm it's displayed or offer next steps. For reading/updating profile data programmatically, use manage_profile instead.",
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
}
