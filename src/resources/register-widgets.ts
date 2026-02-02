import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "../../web/dist");

/** MIME type for OpenAI/ChatGPT widget resources */
const OPENAI_MIME = "text/html+skybridge";

/** MCP Apps UI metadata (Claude Desktop / claude.ai) */
const MCP_UI_META: McpUiResourceMeta = {
  csp: {},
  domain: "gym-tracker",
};

/** OpenAI widget metadata (ChatGPT) — flat "openai/" prefixed keys */
const OAI_META: Record<string, unknown> = {
  "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
  "openai/widgetDomain": "gym-tracker",
};

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
  { name: "programs-list-widget", uri: "ui://gym-tracker/programs-list.html", file: "programs-list.html", description: "Programs list with templates for program selection" },
  { name: "dashboard-widget", uri: "ui://gym-tracker/dashboard.html", file: "dashboard.html", description: "Training dashboard with KPIs and charts" },
  { name: "workout-widget", uri: "ui://gym-tracker/workout.html", file: "workout.html", description: "Interactive workout session editor" },
  { name: "available-programs-widget", uri: "ui://gym-tracker/available-programs.html", file: "available-programs.html", description: "Browse and clone global program templates" },
  { name: "workouts-widget", uri: "ui://gym-tracker/workouts.html", file: "workouts.html", description: "Workout history list with session cards" },
];

/** Read widget HTML from dist, returning a fallback if not built */
function readWidgetFile(filePath: string) {
  return async () => {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        console.error(`[Widget] File not found: ${filePath}. Run: cd web && npm run build`);
        if (process.env.NODE_ENV === "production") {
          return `<!DOCTYPE html><html><body><p style="font-family:system-ui;color:#666;padding:2rem;text-align:center">This feature is temporarily unavailable. Please try again later.</p></body></html>`;
        }
        return `<!DOCTYPE html><html><body><p>Widget not built. Run: cd web && npm run build</p></body></html>`;
      }
      throw err;
    }
  };
}

/**
 * Register all widget resources on the MCP server.
 * Each widget is registered twice:
 *   1. MCP Apps (Claude Desktop / claude.ai) — `text/html;profile=mcp-app`
 *   2. OpenAI (ChatGPT) — `text/html+skybridge`
 * Hosts only request the URI their protocol specifies; the other is ignored.
 */
export function registerWidgetResources(server: McpServer) {
  for (const widget of WIDGETS) {
    const filePath = path.join(DIST_DIR, widget.file);
    const getHtml = readWidgetFile(filePath);

    // MCP Apps registration (existing)
    registerAppResource(
      server,
      widget.name,
      widget.uri,
      {
        mimeType: RESOURCE_MIME_TYPE,
        description: widget.description,
        _meta: { ui: MCP_UI_META },
      },
      async () => {
        const html = await getHtml();
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

    // OpenAI registration — same HTML, different MIME type and URI namespace
    const oaiUri = widget.uri.replace("ui://gym-tracker/", "ui://gym-tracker-oai/");
    server.resource(
      `${widget.name}-oai`,
      oaiUri,
      { mimeType: OPENAI_MIME, description: widget.description, _meta: OAI_META },
      async () => {
        const html = await getHtml();
        return {
          contents: [
            {
              uri: oaiUri,
              mimeType: OPENAI_MIME,
              text: html,
              _meta: OAI_META,
            },
          ],
        };
      }
    );
  }
}
