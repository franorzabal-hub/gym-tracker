import "dotenv/config";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runMigrations } from "./src/db/run-migrations.js";

import { registerContextTool } from "./src/tools/context.js";
import { registerProfileTool } from "./src/tools/profile.js";
import { registerExercisesTool } from "./src/tools/exercises.js";
import { registerSessionTools } from "./src/tools/session.js";
import { registerProgramTool } from "./src/tools/programs.js";
import { registerLogWorkoutTool } from "./src/tools/log-workout.js";
import { registerHistoryTool } from "./src/tools/history.js";
import { registerStatsTool } from "./src/tools/stats.js";
import { registerEditLogTool } from "./src/tools/edit-log.js";
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
import pool from "./src/db/connection.js";

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
// Cloud Run sits behind a Google load balancer — trust one proxy hop
// so req.ip reflects the real client IP (used for rate limiting)
app.set("trust proxy", 1);
app.use(cors({
  origin: getAllowedOrigins(),
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// OAuth routes (before /mcp)
app.use(oauthRoutes);

// New McpServer per request: stateless design means no session affinity needed.
// Each HTTP request gets its own server+transport, so Cloud Run can route
// requests to any instance without sticky sessions.
function createConfiguredServer(): McpServer {
  const server = new McpServer(
    { name: "gym-tracker", version: "1.0.0" },
    {
      instructions: `You are a gym training partner. The user talks naturally in Spanish or English, and you call tools to manage their training.

CRITICAL — First message of every conversation:
1. Call get_context BEFORE responding to the user.
2. Follow the required_action field in the response:
   - If required_action is "setup_profile": new user — call show_profile IMMEDIATELY so they can set up their profile.
   - If required_action is "choose_program": profile exists but no program — call show_programs IMMEDIATELY so they can pick a program.
   - If required_action is null: respond normally (optionally follow the suggestion field).

Never skip step 1. Always get context first.

TOOL TYPES — There are two kinds of tools:
- Data tools (manage_profile, manage_exercises, etc.): read/write data. Use these for onboarding, logging, updating, and any behind-the-scenes work. They return JSON data, no visual UI.
- Display tools (show_profile): render a visual card/widget for the user. Use these ONLY when the user wants to SEE something visually (e.g. "mostrame mi perfil", "quiero ver mis stats").

When the user asks to SEE their profile, call show_profile (NOT manage_profile).`,
    }
  );

  registerContextTool(server);
  registerProfileTool(server);
  registerExercisesTool(server);
  registerSessionTools(server);
  registerProgramTool(server);
  registerLogWorkoutTool(server);
  registerHistoryTool(server);
  registerStatsTool(server);
  registerEditLogTool(server);
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
    const server = app.listen(PORT, () => {
      console.log(`Gym Tracker MCP server running on port ${PORT}`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        console.log("HTTP server closed.");
        try {
          await pool.end();
          console.log("Database pool closed.");
          process.exit(0);
        } catch (err) {
          console.error("Error closing database pool:", err);
          process.exit(1);
        }
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error("Forced shutdown after timeout.");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();
