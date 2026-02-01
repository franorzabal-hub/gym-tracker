import "dotenv/config";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runMigrations } from "./src/db/run-migrations.js";

import { registerOnboardingTool } from "./src/tools/onboarding.js";
import { registerProfileTool } from "./src/tools/profile.js";
import { registerExercisesTool } from "./src/tools/exercises.js";
import { registerSessionTools } from "./src/tools/session.js";
import { registerProgramTool } from "./src/tools/programs.js";
import { registerLogWorkoutTool } from "./src/tools/log-workout.js";
import { registerHistoryTool } from "./src/tools/history.js";
import { registerStatsTool } from "./src/tools/stats.js";
import { registerEditLogTool } from "./src/tools/edit-log.js";
import { registerTemplatesTool } from "./src/tools/templates.js";
import { registerTodayPlanTool } from "./src/tools/today-plan.js";
import { registerBodyMeasurementsTool } from "./src/tools/body-measurements.js";
import { registerExportTool } from "./src/tools/export.js";
import { registerDisplayTools } from "./src/tools/display.js";
import { registerDashboardTool } from "./src/tools/dashboard.js";
import { registerWorkoutTool } from "./src/tools/workout.js";
import { registerWidgetResources } from "./src/resources/register-widgets.js";

import oauthRoutes from "./src/auth/oauth-routes.js";
import { authenticateToken, AuthError } from "./src/auth/middleware.js";
import { runWithUser } from "./src/context/user-context.js";

function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    return ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173", "http://localhost:5174", "http://localhost:8080"];
  }
  return [];
}

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: getAllowedOrigins() }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// OAuth routes (before /mcp)
app.use(oauthRoutes);

// Create a fully configured MCP server instance
function createConfiguredServer(): McpServer {
  const server = new McpServer(
    { name: "gym-tracker", version: "1.0.0" },
    {
      instructions: `You are a gym training partner. The user talks naturally in Spanish or English, and you call tools to manage their training.

CRITICAL — First message of every conversation:
1. Call get_onboarding_status BEFORE responding to the user.
2. If is_new_user is true, start the onboarding flow: ask for their name, then guide them through profile setup and program selection step by step.
3. If is_new_user is false, greet them by name (from profile) and help with whatever they need.

Never skip step 1. Always check onboarding status first.

TOOL TYPES — There are two kinds of tools:
- Data tools (manage_profile, manage_exercises, etc.): read/write data. Use these for onboarding, logging, updating, and any behind-the-scenes work. They return JSON data, no visual UI.
- Display tools (show_profile): render a visual card/widget for the user. Use these ONLY when the user wants to SEE something visually (e.g. "mostrame mi perfil", "quiero ver mis stats").

When the user asks to SEE their profile, call show_profile (NOT manage_profile).`,
    }
  );

  registerOnboardingTool(server);
  registerProfileTool(server);
  registerExercisesTool(server);
  registerSessionTools(server);
  registerProgramTool(server);
  registerLogWorkoutTool(server);
  registerHistoryTool(server);
  registerStatsTool(server);
  registerEditLogTool(server);
  registerTemplatesTool(server);
  registerTodayPlanTool(server);
  registerBodyMeasurementsTool(server);
  registerExportTool(server);
  registerDisplayTools(server);
  registerDashboardTool(server);
  registerWorkoutTool(server);
  registerWidgetResources(server);

  return server;
}

// MCP endpoint
app.all("/mcp", async (req, res) => {
  try {
    let userId: number;

    if (process.env.DEV_USER_ID && process.env.NODE_ENV !== "production") {
      userId = Number(process.env.DEV_USER_ID);
      if (Number.isNaN(userId)) {
        throw new Error("DEV_USER_ID must be a valid number");
      }
    } else {
      userId = await authenticateToken(req);
    }

    await runWithUser(userId, async () => {
      const server = createConfiguredServer();

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close();
        server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  } catch (err) {
    if (err instanceof AuthError) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="gym-tracker"');
      res.status(401).json({
        error: "unauthorized",
        message: err.message,
      });
      return;
    }
    console.error("MCP endpoint error:", err instanceof Error ? err.stack : err);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message: "An unexpected error occurred" });
    }
  }
});

// Start
const PORT = Number(process.env.PORT) || 3001;

async function start() {
  try {
    await runMigrations();
    app.listen(PORT, () => {
      console.log(`Gym Tracker MCP server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();
