import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse, APP_CONTEXT } from "../helpers/tool-response.js";
import { getRecommendedTemplate } from "../helpers/program-templates.js";

export function registerOnboardingTool(server: McpServer) {
  server.tool(
    "initialize_gym_session",
    `${APP_CONTEXT}MANDATORY: Call this tool FIRST before calling any other gym-tracker tool. This initializes the user context and returns critical routing information.

Returns the user's setup state: profile, active program, training history, and onboarding status. Without calling this first, other tools may behave incorrectly because you won't know the user's context.

CRITICAL ROUTING — you MUST follow the "required_next_tool" field in the response:
- If required_next_tool is set: call that tool IMMEDIATELY as your next action. Do NOT greet the user, do NOT explain anything, do NOT ask questions. Just call the tool.
- If required_next_tool is null: respond normally using the suggestion field.`,
    {},
    async () => {
      const userId = getUserId();

      // Check profile
      const { rows: profileRows } = await pool.query(
        "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const profile = profileRows[0]?.data || null;
      const profileComplete = !!(profile && profile.name);
      const onboarding = profile?.onboarding || null;

      // Check active program
      const { rows: programRows } = await pool.query(
        "SELECT id FROM programs WHERE user_id = $1 AND is_active = TRUE LIMIT 1",
        [userId]
      );
      const hasProgram = programRows.length > 0;

      // Check session history
      const { rows: sessionRows } = await pool.query(
        "SELECT id FROM sessions WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1",
        [userId]
      );
      const hasHistory = sessionRows.length > 0;

      const isNewUser = !profileComplete && !hasProgram && !hasHistory;

      // Build suggestion
      let suggestion: string | null = null;
      if (!profileComplete && !isNewUser) {
        suggestion = "Profile incomplete. Ask the user if they want to update their profile.";
      } else if (profileComplete && !hasProgram) {
        const available = profile?.available_days ?? 4;
        const experience = profile?.experience ?? "intermediate";
        const recommended = getRecommendedTemplate(available, experience);
        suggestion = `Profile complete but no program. Recommend template "${recommended}" based on ${available} available days and ${experience} experience. Use manage_program list_templates to show options.`;
      } else if (onboarding && !onboarding.completed) {
        suggestion = "Almost done! Mark onboarding complete by updating profile with onboarding.completed = true.";
      }

      return toolResponse({
        is_new_user: isNewUser,
        profile_complete: profileComplete,
        has_program: hasProgram,
        has_history: hasHistory,
        onboarding,
        suggestion,
        required_next_tool: isNewUser ? "show_onboarding" : null,
      });
    }
  );
}
