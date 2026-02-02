import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerOnboardingTool(server: McpServer) {
  server.registerTool(
    "initialize_gym_session",
    {
      description: `${APP_CONTEXT}MANDATORY: Call this tool FIRST before calling any other gym-tracker tool. This initializes the user context and returns critical routing information.

Returns the user's setup state: profile, active program, training history, and onboarding status. Without calling this first, other tools may behave incorrectly because you won't know the user's context.

CRITICAL ROUTING — you MUST follow the "required_next_tool" field in the response:
- If required_next_tool is "show_profile": new user — call show_profile IMMEDIATELY to let them set up their profile. After profile setup, call show_programs to help them pick a program.
- If required_next_tool is "show_programs": profile complete but no program — call show_programs IMMEDIATELY to let them pick or create a program.
- If required_next_tool is null: respond normally using the suggestion field.`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "Initializing session...",
        "openai/toolInvocation/invoked": "Session initialized",
      },
    },
    async () => {
      const userId = getUserId();

      // Check profile
      const { rows: profileRows } = await pool.query(
        "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const profile = profileRows[0]?.data || null;
      const profileComplete = !!(profile && profile.name);

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

      // Determine required next tool and suggestion
      let required_next_tool: string | null = null;
      let suggestion: string | null = null;

      if (isNewUser) {
        required_next_tool = "show_profile";
      } else if (!profileComplete) {
        suggestion = "Profile incomplete. Ask the user if they want to update their profile.";
      } else if (!hasProgram) {
        required_next_tool = "show_programs";
      }

      return toolResponse({
        is_new_user: isNewUser,
        profile_complete: profileComplete,
        has_program: hasProgram,
        has_history: hasHistory,
        suggestion,
        required_next_tool,
      });
    }
  );
}
