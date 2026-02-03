import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { inferTodayDay } from "../helpers/program-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";

export function registerContextTool(server: McpServer) {
  server.registerTool(
    "get_context",
    {
      description: `${APP_CONTEXT}MANDATORY: Call this tool FIRST before calling any other gym-tracker tool. Returns the full user context in a single call.

Returns:
- profile: user setup state and data
- program: active program info and today's planned day
- active_workout: current open workout session (if any)
- routing: required_action and suggestions for next steps

CRITICAL ROUTING — you MUST follow the "required_action" field in the response:
- If required_action is "setup_profile": new user — call show_profile IMMEDIATELY to let them set up their profile.
- If required_action is "choose_program": profile complete but no program — call show_programs IMMEDIATELY to let them pick or create a program.
- If required_action is null: respond normally using the suggestion field.`,
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: {
        "openai/toolInvocation/invoking": "Loading context...",
        "openai/toolInvocation/invoked": "Context loaded",
      },
    },
    safeHandler("get_context", async () => {
      const userId = getUserId();

      // --- Profile ---
      const { rows: profileRows } = await pool.query(
        "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const profileData = profileRows[0]?.data || null;
      const profileComplete = !!(profileData && profileData.name);

      // --- Program ---
      const { rows: programRows } = await pool.query(
        `SELECT p.id, p.name, pv.id as version_id
         FROM programs p
         JOIN program_versions pv ON pv.program_id = p.id
         WHERE p.user_id = $1 AND p.is_active = TRUE
         ORDER BY pv.version_number DESC LIMIT 1`,
        [userId]
      );
      const activeProgram = programRows[0] || null;

      // Get today's day if there's an active program
      let todayDay: { day_label: string } | null = null;
      if (activeProgram) {
        const timezone = profileData?.timezone || undefined;
        const inferred = await inferTodayDay(activeProgram.id, timezone);
        if (inferred) {
          todayDay = { day_label: inferred.day_label };
        }
      }

      // --- History check ---
      const { rows: historyRows } = await pool.query(
        "SELECT id FROM sessions WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1",
        [userId]
      );
      const hasHistory = historyRows.length > 0;

      // --- Active workout ---
      const { rows: activeRows } = await pool.query(
        "SELECT id, started_at, program_day_id, tags FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
        [userId]
      );

      let activeWorkout: any = null;
      if (activeRows.length > 0) {
        const session = activeRows[0];
        const durationMinutes = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);

        // Get program day label
        let programDay: string | undefined;
        if (session.program_day_id) {
          const { rows: dayRows } = await pool.query(
            "SELECT day_label FROM program_days WHERE id = $1",
            [session.program_day_id]
          );
          if (dayRows.length > 0) programDay = dayRows[0].day_label;
        }

        // Get exercise count and set count
        const { rows: [counts] } = await pool.query(
          `SELECT COUNT(DISTINCT se.id) as exercise_count, COUNT(st.id) as set_count
           FROM session_exercises se
           LEFT JOIN sets st ON st.session_exercise_id = se.id
           WHERE se.session_id = $1`,
          [session.id]
        );

        activeWorkout = {
          id: session.id,
          started_at: session.started_at,
          duration_minutes: durationMinutes,
          program_day: programDay,
          exercises_logged: Number(counts.exercise_count),
          sets_logged: Number(counts.set_count),
          tags: session.tags || [],
        };
      }

      // --- Routing ---
      const isNewUser = !profileComplete && !activeProgram && !hasHistory;
      let required_action: string | null = null;
      let suggestion: string | null = null;

      if (isNewUser) {
        required_action = "setup_profile";
      } else if (!profileComplete) {
        suggestion = "Profile incomplete. Ask the user if they want to update their profile.";
      } else if (!activeProgram) {
        required_action = "choose_program";
      } else if (activeWorkout) {
        suggestion = `Active workout in progress (${activeWorkout.duration_minutes} min). Continue logging or end the workout.`;
      } else if (todayDay) {
        suggestion = `Today is ${todayDay.day_label}. Ask if they want to start training.`;
      }

      return toolResponse({
        profile: {
          complete: profileComplete,
          data: profileData,
        },
        program: {
          active: activeProgram ? activeProgram.name : null,
          today_day: todayDay?.day_label || null,
        },
        active_workout: activeWorkout,
        has_history: hasHistory,
        required_action,
        suggestion,
      });
    })
  );
}
