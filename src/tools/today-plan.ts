import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getActiveProgram, inferTodayDay } from "../helpers/program-helpers.js";
import { getUserId } from "../context/user-context.js";
import { toolResponse } from "../helpers/tool-response.js";

export function registerTodayPlanTool(server: McpServer) {
  server.registerTool(
    "get_today_plan",
    {
      title: "Get Today's Plan",
      description: `Get today's planned workout without starting a session. Returns the program day, exercises with targets, and last workout comparison.
Uses the active program + user's timezone to infer which day it is. Returns rest_day if no day is mapped to today.`,
      inputSchema: {
        include_last_workout: z.boolean().optional().describe("If true, include last workout data. Defaults to true"),
      },
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: "ui://gym-tracker/today-plan.html" },
        "openai/outputTemplate": "ui://gym-tracker/today-plan.html",
        "openai/toolInvocation/invoking": "Loading today\u2019s plan\u2026",
        "openai/toolInvocation/invoked": "Plan ready",
      },
    },
    async ({ include_last_workout }) => {
      const userId = getUserId();

      const activeProgram = await getActiveProgram();
      if (!activeProgram) {
        return toolResponse({ error: "No active program" }, true);
      }

      // Get user timezone
      const { rows: profileRows } = await pool.query(
        "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const timezone = profileRows[0]?.timezone || undefined;

      const todayDay = await inferTodayDay(activeProgram.id, timezone);
      if (!todayDay) {
        return toolResponse({
          program: activeProgram.name,
          rest_day: true,
          message: "No workout scheduled for today",
        });
      }

      // Get exercises for today's day
      const { rows: exercises } = await pool.query(
        `SELECT e.name, e.rep_type, e.exercise_type,
           pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe,
           pde.rest_seconds, pde.notes, pde.superset_group
         FROM program_day_exercises pde
         JOIN exercises e ON e.id = pde.exercise_id
         WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
        [todayDay.id]
      );

      const result: any = {
        program: activeProgram.name,
        day: todayDay.day_label,
        exercises,
      };

      // Get last workout for this program day
      if (include_last_workout !== false) {
        const { rows: lastSession } = await pool.query(
          `SELECT s.id, s.started_at FROM sessions s
           WHERE s.user_id = $1 AND s.program_day_id = $2 AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
           ORDER BY s.started_at DESC LIMIT 1`,
          [userId, todayDay.id]
        );

        if (lastSession.length > 0) {
          const { rows: lastExercises } = await pool.query(
            `SELECT e.name,
               json_agg(json_build_object(
                 'set_number', st.set_number,
                 'reps', st.reps,
                 'weight', st.weight,
                 'rpe', st.rpe,
                 'set_type', st.set_type
               ) ORDER BY st.set_number) as sets
             FROM session_exercises se
             JOIN exercises e ON e.id = se.exercise_id
             JOIN sets st ON st.session_exercise_id = se.id
             WHERE se.session_id = $1
             GROUP BY e.name, se.sort_order
             ORDER BY se.sort_order`,
            [lastSession[0].id]
          );

          result.last_workout = {
            date: lastSession[0].started_at,
            exercises: lastExercises,
          };
        }
      }

      return toolResponse(result);
    }
  );
}
