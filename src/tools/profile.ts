import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { profileSchema, normalizeProfileData, MAX_PROFILE_SIZE_BYTES } from "../helpers/profile-helpers.js";

export function registerProfileTool(server: McpServer) {
  server.registerTool(
    "manage_profile",
    {
      description: `${APP_CONTEXT}Read or update user profile data. This is a data-only tool — no visual UI.
Use action "get" to retrieve the current profile (call this at conversation start for context).
Use action "update" to save user info. The data field merges with existing data.
When the user wants to SEE their profile visually, call show_profile instead.

Standard fields (always use these exact keys):
- name: string — display name
- age: number — years
- sex: "male" | "female"
- weight_kg: number
- height_cm: number
- goals: string[] — e.g. ["hypertrophy", "strength"]
- experience_level: "beginner" | "intermediate" | "advanced"
- training_days_per_week: number — e.g. 3
- available_days: string[] — e.g. ["monday", "wednesday", "friday"]
- injuries: string[] — e.g. ["left shoulder"]
- preferred_units: "kg" | "lb"
- gym: string — gym name
- supplements: string
- requires_validation: boolean — when true, new workouts/programs need manual validation before affecting stats

Example: user says "peso 82kg" → update with { "weight_kg": 82 }
Example: user says "entreno lunes miercoles y viernes" → update with { "training_days_per_week": 3, "available_days": ["monday", "wednesday", "friday"] }`,
      inputSchema: {
        action: z.enum(["get", "update"]),
        data: z.record(z.any()).optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: {
        "openai/visibility": "private",
        "openai/widgetAccessible": true,
      },
    },
    safeHandler("manage_profile", async ({ action, data }) => {
      const userId = getUserId();

      if (action === "get") {
        const { rows } = await pool.query(
          "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        const profile = rows[0]?.data || {};

        return toolResponse({ profile });
      }

      // update
      if (!data || Object.keys(data).length === 0) {
        return toolResponse({ error: "No data provided" }, true);
      }

      // Normalize the data (trim strings, filter empty injuries, etc.)
      const normalized = normalizeProfileData(data);

      // Check size limit
      if (JSON.stringify(normalized).length > MAX_PROFILE_SIZE_BYTES) {
        return toolResponse({ error: "Profile data exceeds maximum size limit" }, true);
      }

      // Validate with Zod schema
      const parsed = profileSchema.safeParse(normalized);
      if (!parsed.success) {
        const errors = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        return toolResponse({ error: "Invalid profile data", details: errors }, true);
      }

      const { rows } = await pool.query(
        `INSERT INTO user_profile (user_id, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET data = user_profile.data || EXCLUDED.data, updated_at = NOW()
         RETURNING data`,
        [userId, JSON.stringify(parsed.data)]
      );

      const updated = rows[0].data;
      return toolResponse({ profile: updated });
    })
  );
}
