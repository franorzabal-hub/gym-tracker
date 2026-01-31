import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "../../web/dist");

/** Widget definitions mapping resource URIs to built HTML files */
const WIDGETS: Array<{ name: string; uri: string; file: string; description: string }> = [
  { name: "session-widget", uri: "ui://gym-tracker/session.html", file: "session.html", description: "Active session dashboard with exercises and sets" },
  { name: "stats-widget", uri: "ui://gym-tracker/stats.html", file: "stats.html", description: "Exercise statistics, progression, and history" },
  { name: "today-plan-widget", uri: "ui://gym-tracker/today-plan.html", file: "today-plan.html", description: "Today's planned workout with exercises" },
  { name: "exercises-widget", uri: "ui://gym-tracker/exercises.html", file: "exercises.html", description: "Exercise library management" },
  { name: "programs-widget", uri: "ui://gym-tracker/programs.html", file: "programs.html", description: "Workout program management" },
  { name: "templates-widget", uri: "ui://gym-tracker/templates.html", file: "templates.html", description: "Session template management" },
  { name: "measurements-widget", uri: "ui://gym-tracker/measurements.html", file: "measurements.html", description: "Body measurement tracking" },
  { name: "profile-widget", uri: "ui://gym-tracker/profile.html", file: "profile.html", description: "User profile data" },
  { name: "export-widget", uri: "ui://gym-tracker/export.html", file: "export.html", description: "Data export viewer" },
];

/**
 * Register all widget resources on the MCP server.
 * Each widget is served as a ui:// resource with the MCP Apps mime type.
 * Hosts that don't support MCP Apps will ignore these resources.
 */
export function registerWidgetResources(server: McpServer) {
  for (const widget of WIDGETS) {
    registerAppResource(
      server,
      widget.name,
      widget.uri,
      {
        mimeType: RESOURCE_MIME_TYPE,
        description: widget.description,
      },
      async () => {
        let html: string;
        const filePath = path.join(DIST_DIR, widget.file);
        try {
          html = await fs.readFile(filePath, "utf-8");
          console.log(`[Widget] Serving ${widget.uri} (${html.length} bytes) from ${filePath}`);
        } catch (err) {
          console.error(`[Widget] Failed to read ${filePath}:`, err);
          html = `<!DOCTYPE html><html><body><p>Widget not built. Run: cd web && npm run build</p></body></html>`;
        }
        return {
          contents: [
            {
              uri: widget.uri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
            },
          ],
        };
      }
    );
  }
}
