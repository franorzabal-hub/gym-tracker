/**
 * Unified API Tool — Single tool that exposes all data operations.
 * The LLM reads the API spec and calls endpoints programmatically.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { API_SPEC } from "../api/spec.js";
import * as handlers from "../api/handlers.js";

/**
 * Route an API request to the appropriate handler.
 */
async function routeRequest(method: string, path: string, body: Record<string, any> = {}): Promise<any> {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.toLowerCase().replace(/\/+$/, ""); // Remove trailing slashes

  // Parse path parameters (e.g., /exercises/:name, /programs/:id)
  const pathParts = normalizedPath.split("/").filter(Boolean);

  // ============================================================================
  // CONTEXT
  // ============================================================================

  if (normalizedPath === "/context" && normalizedMethod === "GET") {
    return handlers.getContext();
  }

  // ============================================================================
  // PROFILE
  // ============================================================================

  if (normalizedPath === "/profile") {
    if (normalizedMethod === "GET") {
      return handlers.getProfileHandler();
    }
    if (normalizedMethod === "PATCH") {
      return handlers.updateProfile(body);
    }
  }

  // ============================================================================
  // EXERCISES
  // ============================================================================

  if (normalizedPath === "/exercises" && normalizedMethod === "GET") {
    return handlers.listExercises(body);
  }

  if (normalizedPath === "/exercises/search" && normalizedMethod === "GET") {
    return handlers.searchExercisesHandler(body);
  }

  if (normalizedPath === "/exercises" && normalizedMethod === "POST") {
    return handlers.addExercise(body as any);
  }

  if (normalizedPath === "/exercises/bulk" && normalizedMethod === "POST") {
    return handlers.addExercisesBulk(body as any);
  }

  if (normalizedPath === "/exercises/merge" && normalizedMethod === "POST") {
    return handlers.mergeExercises(body.source, body.target);
  }

  // /exercises/:name
  if (pathParts[0] === "exercises" && pathParts.length === 2) {
    const name = decodeURIComponent(pathParts[1]);
    if (normalizedMethod === "PATCH") {
      return handlers.updateExercise(name, body);
    }
    if (normalizedMethod === "DELETE") {
      return handlers.deleteExercise(name);
    }
  }

  // ============================================================================
  // PROGRAMS
  // ============================================================================

  if (normalizedPath === "/programs" && normalizedMethod === "GET") {
    return handlers.listPrograms("user");
  }

  if (normalizedPath === "/programs/available" && normalizedMethod === "GET") {
    return handlers.listPrograms("available");
  }

  // /programs/:id
  if (pathParts[0] === "programs" && pathParts.length === 2 && !isNaN(Number(pathParts[1]))) {
    const id = Number(pathParts[1]);
    if (normalizedMethod === "GET") {
      return handlers.getProgram(id);
    }
    if (normalizedMethod === "DELETE") {
      return handlers.deleteProgram(id);
    }
  }

  // /programs/:id/activate
  if (pathParts[0] === "programs" && pathParts[2] === "activate" && normalizedMethod === "POST") {
    const id = Number(pathParts[1]);
    return handlers.activateProgram(id);
  }

  // ============================================================================
  // WORKOUTS
  // ============================================================================

  if (normalizedPath === "/workouts" && normalizedMethod === "POST") {
    return handlers.logWorkout(body);
  }

  if (normalizedPath === "/workouts/end" && normalizedMethod === "POST") {
    return handlers.endWorkout(body);
  }

  if (normalizedPath === "/workouts" && normalizedMethod === "GET") {
    return handlers.getWorkouts(body);
  }

  if (normalizedPath === "/workouts/bulk" && normalizedMethod === "DELETE") {
    return handlers.deleteWorkoutsBulk(body.ids);
  }

  if (normalizedPath === "/workouts/today" && normalizedMethod === "GET") {
    return handlers.getTodayPlan();
  }

  // /workouts/:id or /workouts/:selector (supports "today", "last", "yesterday", dates)
  if (pathParts[0] === "workouts" && pathParts.length === 2 && pathParts[1] !== "end" && pathParts[1] !== "today") {
    const selector = decodeURIComponent(pathParts[1]);
    if (normalizedMethod === "GET") {
      // If numeric, use workout_id; otherwise treat as selector
      const numId = Number(selector);
      if (!isNaN(numId)) {
        return handlers.getWorkouts({ workout_id: numId });
      }
      // For semantic selectors, we need to resolve and get
      return handlers.getWorkouts({ workout_id: undefined, ...body });
    }
    if (normalizedMethod === "DELETE") {
      return handlers.deleteWorkout(selector);
    }
  }

  // /workouts/:id/restore
  if (pathParts[0] === "workouts" && pathParts.length === 3 && pathParts[2] === "restore") {
    const selector = decodeURIComponent(pathParts[1]);
    if (normalizedMethod === "POST") {
      return handlers.restoreWorkout(selector);
    }
  }

  // ============================================================================
  // STATS
  // ============================================================================

  if (normalizedPath === "/stats" && normalizedMethod === "GET") {
    return handlers.getStats(body);
  }

  // ============================================================================
  // MEASUREMENTS
  // ============================================================================

  if (normalizedPath === "/measurements" && normalizedMethod === "POST") {
    return handlers.logMeasurement(body as any);
  }

  if (normalizedPath === "/measurements" && normalizedMethod === "GET") {
    return handlers.getMeasurements(body);
  }

  if (normalizedPath === "/measurements/latest" && normalizedMethod === "GET") {
    return handlers.getLatestMeasurements();
  }

  // ============================================================================
  // NOT FOUND
  // ============================================================================

  throw new Error(`Unknown endpoint: ${normalizedMethod} ${normalizedPath}`);
}

export function registerApiTool(server: McpServer) {
  // Register the API spec as a resource
  server.resource(
    "api-spec",
    "text://gym-tracker/api-spec",
    {
      description: "Full API documentation for the gym-tracker api tool",
      mimeType: "text/plain",
    },
    async () => ({
      contents: [{ uri: "text://gym-tracker/api-spec", text: API_SPEC, mimeType: "text/plain" }],
    })
  );

  // Register the unified API tool
  server.registerTool(
    "api",
    {
      description: `${APP_CONTEXT}Unified API for all gym tracking data operations.

IMPORTANT: Read the API spec resource (text://gym-tracker/api-spec) to see all available endpoints.

This tool lets you call REST-like endpoints programmatically:
- method: HTTP method (GET, POST, PATCH, DELETE)
- path: Endpoint path (e.g., "/context", "/workouts", "/exercises/bench press")
- body: Request body (for POST/PATCH, or query params for GET)

## Quick Reference

### MANDATORY First Call
GET /context — Returns user context, active program, workout state, and routing instructions.

### Common Operations
| Action | Endpoint |
|--------|----------|
| Get profile | GET /profile |
| Update profile | PATCH /profile |
| List exercises | GET /exercises |
| Search exercises | GET /exercises/search |
| Start/log workout | POST /workouts |
| End workout | POST /workouts/end |
| Get workout history | GET /workouts |
| Get today's plan | GET /workouts/today |
| Get stats | GET /stats |
| Log measurement | POST /measurements |

### Example Calls
\`\`\`json
// Get context (MANDATORY first call)
{ "method": "GET", "path": "/context" }

// Update profile
{ "method": "PATCH", "path": "/profile", "body": { "weight_kg": 82 } }

// Log a workout
{ "method": "POST", "path": "/workouts", "body": { "program_day": "Push" } }

// Log single exercise
{ "method": "POST", "path": "/workouts", "body": { "exercise": "bench press", "reps": 10, "weight": 80 } }

// End workout
{ "method": "POST", "path": "/workouts/end" }

// Get stats
{ "method": "GET", "path": "/stats", "body": { "exercise": "bench press", "period": "month" } }
\`\`\`

For full endpoint documentation, read the api-spec resource.`,
      inputSchema: {
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]).describe("HTTP method"),
        path: z.string().describe("API endpoint path (e.g., '/context', '/workouts', '/exercises/bench press')"),
        body: z.record(z.any()).optional().describe("Request body for POST/PATCH, or query parameters for GET"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Some operations are destructive
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Calling API...",
        "openai/toolInvocation/invoked": "API call complete",
      },
    },
    safeHandler("api", async ({ method, path, body }) => {
      const result = await routeRequest(method, path, body || {});
      return toolResponse(result);
    })
  );
}
