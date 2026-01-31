import "dotenv/config";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runMigrations } from "./src/db/run-migrations.js";

import { registerProfileTool } from "./src/tools/profile.js";
import { registerExercisesTool } from "./src/tools/exercises.js";
import { registerSessionTools } from "./src/tools/session.js";
import { registerLogExerciseTool } from "./src/tools/log-exercise.js";
import { registerProgramTool } from "./src/tools/programs.js";
import { registerLogRoutineTool } from "./src/tools/log-routine.js";
import { registerHistoryTool } from "./src/tools/history.js";
import { registerStatsTool } from "./src/tools/stats.js";
import { registerEditLogTool } from "./src/tools/edit-log.js";
import { registerTemplatesTool } from "./src/tools/templates.js";
import { registerTodayPlanTool } from "./src/tools/today-plan.js";
import { registerBodyMeasurementsTool } from "./src/tools/body-measurements.js";
import { registerExportTool } from "./src/tools/export.js";
import { registerWidgetResources } from "./src/resources/register-widgets.js";

import oauthRoutes from "./src/auth/oauth-routes.js";
import { authenticateToken, AuthError } from "./src/auth/middleware.js";
import { runWithUser } from "./src/context/user-context.js";

function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    return ["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"];
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
  const server = new McpServer({
    name: "gym-tracker",
    version: "1.0.0",
  });

  registerProfileTool(server);
  registerExercisesTool(server);
  registerSessionTools(server);
  registerLogExerciseTool(server);
  registerProgramTool(server);
  registerLogRoutineTool(server);
  registerHistoryTool(server);
  registerStatsTool(server);
  registerEditLogTool(server);
  registerTemplatesTool(server);
  registerTodayPlanTool(server);
  registerBodyMeasurementsTool(server);
  registerExportTool(server);
  registerWidgetResources(server);

  return server;
}

// MCP endpoint
app.all("/mcp", async (req, res) => {
  try {
    let userId: number;

    if (process.env.DEV_USER_ID && process.env.NODE_ENV !== "production") {
      userId = Number(process.env.DEV_USER_ID);
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
    console.error("MCP endpoint error:", err);
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
