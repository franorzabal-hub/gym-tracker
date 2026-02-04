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
      description: `${APP_CONTEXT}Unified API for gym tracking. Call with { method, path, body? }

══════════════════════════════════════════════════════════════
MANDATORY FIRST CALL
══════════════════════════════════════════════════════════════
GET /context → { profile, program, active_workout, required_action }
Follow required_action: "setup_profile" | "choose_program" | null

══════════════════════════════════════════════════════════════
WORKOUTS — TWO WORKFLOWS
══════════════════════════════════════════════════════════════

★ CARGAR/REGISTRAR (batch mode)
User says: "cargar", "registrar", "cargame el día", "load workout"
→ POST /workouts { program_day: "Push" } or { exercises: [...] }
→ POST /workouts/end
→ show_workout (display tool)
IMPORTANT: Complete all 3 steps automatically without asking.

★ INICIAR/EMPEZAR (interactive mode)
User says: "empezar", "iniciar", "voy a entrenar", "arranco"
→ POST /workouts { } (start empty session)
→ User logs exercises one by one as they train
→ When user says "terminé/listo/done" → POST /workouts/end → show_workout

══════════════════════════════════════════════════════════════
POST /workouts — Create workout and/or log exercises
══════════════════════════════════════════════════════════════
Body options:

1. Start empty session:
   { }

2. Log ONE exercise:
   { "exercise": "bench press", "sets": 3, "reps": 10, "weight": 80 }

3. Log with PROGRESSION (different reps/weight per set):
   { "exercise": "squat", "sets": 4, "reps": [12,10,8,6], "weight": [80,90,100,110] }
   → Set 1: 12 reps @ 80kg, Set 2: 10 @ 90kg, Set 3: 8 @ 100kg, Set 4: 6 @ 110kg

4. Log MULTIPLE exercises:
   { "exercises": [
       { "exercise": "bench", "sets": 3, "reps": 10, "weight": 80 },
       { "exercise": "squat", "sets": 4, "reps": [12,10,8,6], "weight": [80,90,100,110] }
   ]}

5. Log entire PROGRAM DAY:
   { "program_day": "Push" }

6. Backdate: { "date": "2025-01-28", "exercises": [...] }

POST /workouts/end → { summary }
  Body: { notes?, tags?, force? }

GET /workouts → { sessions, summary }
  Body: { period?: "today"|"week"|"month"|"year", workout_id?, limit? }

DELETE /workouts/:selector → { deleted_workout }
  Selector: ID | "today" | "last" | "yesterday" | "YYYY-MM-DD"

DELETE /workouts/bulk → { deleted, deleted_count }
  Body: { "ids": [1, 2, 3] }

POST /workouts/:selector/restore → { restored_workout }

══════════════════════════════════════════════════════════════
PROFILE
══════════════════════════════════════════════════════════════
GET /profile → { profile }
PATCH /profile → { profile }
  Body: { name?, age?, weight_kg?, height_cm?, goals?, ... }

══════════════════════════════════════════════════════════════
EXERCISES
══════════════════════════════════════════════════════════════
GET /exercises → { exercises, total }
GET /exercises/search → { exercises }  Body: { query }
POST /exercises → { exercise }  Body: { name, muscle_group? }
DELETE /exercises/:name → { deleted }

══════════════════════════════════════════════════════════════
PROGRAMS
══════════════════════════════════════════════════════════════
GET /programs → { programs }
GET /programs/:id → { program }
POST /programs → { program }
  Body: { name, days: [{ day_label, exercises: [{ exercise, target_sets, target_reps, target_weight? }] }] }
POST /programs/:id/activate → { activated }
DELETE /programs/:id → { deleted }

══════════════════════════════════════════════════════════════
STATS & MEASUREMENTS
══════════════════════════════════════════════════════════════
GET /stats → { stats }
  Body: { exercise | exercises[], period?: "week"|"month"|"year" }

POST /measurements → { measurement }
  Body: { type: "weight_kg"|"body_fat_pct", value }
GET /measurements/latest → { measurements }

══════════════════════════════════════════════════════════════
EXAMPLES
══════════════════════════════════════════════════════════════
// Pyramid (12/10/8 reps, increasing weight)
{ "method": "POST", "path": "/workouts", "body": {
  "exercise": "bench", "sets": 3, "reps": [12,10,8], "weight": [60,70,80]
}}

// Drop set (same reps, decreasing weight)
{ "method": "POST", "path": "/workouts", "body": {
  "exercise": "lateral raise", "sets": 3, "reps": 12, "weight": [15,12,10]
}}

// Delete all workouts
{ "method": "DELETE", "path": "/workouts/bulk", "body": { "ids": [1,2,3,4,5] }}`,
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
