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

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// MCP endpoint
app.all("/mcp", async (req, res) => {
  const server = new McpServer({
    name: "gym-tracker",
    version: "1.0.0",
  });

  // Register all tools
  registerProfileTool(server);
  registerExercisesTool(server);
  registerSessionTools(server);
  registerLogExerciseTool(server);
  registerProgramTool(server);
  registerLogRoutineTool(server);
  registerHistoryTool(server);
  registerStatsTool(server);
  registerEditLogTool(server);

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
