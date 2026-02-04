import "dotenv/config";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runMigrations } from "./src/db/run-migrations.js";

// === UNIFIED API TOOL (replaces individual data tools) ===
import { registerApiTool } from "./src/tools/api.js";

// === DATA TOOLS (commented out — now handled by unified api tool) ===
// import { registerContextTool } from "./src/tools/context.js";
// import { registerProfileTool } from "./src/tools/profile.js";
// import { registerExercisesTool } from "./src/tools/exercises.js";
// import { registerSessionTools } from "./src/tools/session.js";
// import { registerProgramTool } from "./src/tools/programs.js";
// import { registerLogWorkoutTool } from "./src/tools/log-workout.js";
// import { registerHistoryTool } from "./src/tools/history.js";
// import { registerStatsTool } from "./src/tools/stats.js";
// import { registerEditLogTool } from "./src/tools/edit-log.js";
// import { registerTodayPlanTool } from "./src/tools/today-plan.js";
// import { registerBodyMeasurementsTool } from "./src/tools/body-measurements.js";
// import { registerExportTool } from "./src/tools/export.js";

// === DISPLAY TOOLS (kept — these render UI widgets) ===
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

## UNIFIED API APPROACH

This server uses a single \`api\` tool for all data operations. Read the API spec resource (text://gym-tracker/api-spec) to see available endpoints.

CRITICAL — First message of every conversation:
1. Call \`api({ method: "GET", path: "/context" })\` BEFORE responding.
2. Follow the required_action field in the response:
   - "setup_profile": new user — call show_profile IMMEDIATELY.
   - "choose_program": profile exists but no program — call show_programs IMMEDIATELY.
   - null: respond normally (optionally follow the suggestion field).

## TOOL TYPES

1. **api** — Single tool for ALL data operations. Use REST-like calls:
   - GET /context — user context (MANDATORY first call)
   - GET/PATCH /profile — profile data
   - GET/POST /workouts — workout logging
   - GET /stats — exercise statistics
   - etc. (see api-spec resource for full list)

2. **Display tools** (show_*) — Render visual widgets. Use when user wants to SEE something:
   - show_profile — visual profile card
   - show_programs — program list
   - show_program — program details
   - show_workout — workout viewer
   - show_workouts — workout history
   - show_dashboard — training dashboard

## EXAMPLES

\`\`\`json
// Get context
api({ "method": "GET", "path": "/context" })

// Update profile
api({ "method": "PATCH", "path": "/profile", "body": { "weight_kg": 82 } })

// Log a workout day
api({ "method": "POST", "path": "/workouts", "body": { "program_day": "Push" } })

// Log single exercise
api({ "method": "POST", "path": "/workouts", "body": { "exercise": "bench press", "reps": 10, "weight": 80 } })

// End workout
api({ "method": "POST", "path": "/workouts/end" })
\`\`\`

When the user asks to SEE their profile, call show_profile (NOT api).`,
    }
  );

  // === UNIFIED API TOOL ===
  registerApiTool(server);

  // === DATA TOOLS (commented out — now handled by unified api tool) ===
  // registerContextTool(server);
  // registerProfileTool(server);
  // registerExercisesTool(server);
  // registerSessionTools(server);
  // registerProgramTool(server);
  // registerLogWorkoutTool(server);
  // registerHistoryTool(server);
  // registerStatsTool(server);
  // registerEditLogTool(server);
  // registerTodayPlanTool(server);
  // registerBodyMeasurementsTool(server);
  // registerExportTool(server);

  // === DISPLAY TOOLS ===
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
