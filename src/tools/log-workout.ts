import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import {
  getActiveProgram,
  inferTodayDay,
} from "../helpers/program-helpers.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import { checkPRs } from "../helpers/stats-calculator.js";
import { getUserId } from "../context/user-context.js";
import { parseJsonParam, parseJsonArrayParam } from "../helpers/parse-helpers.js";
import { toolResponse, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { logSingleExercise, exerciseEntrySchema, type ExerciseEntry } from "../helpers/log-exercise-helper.js";
import { cloneGroups } from "../helpers/group-helpers.js";
import { cloneSections } from "../helpers/section-helpers.js";

const overrideSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().optional(),
  reps: z.number().int().optional(),
  weight: z.number().optional(),
  rpe: z.number().optional(),
});

export function registerLogWorkoutTool(server: McpServer) {
  server.registerTool("log_workout", {
    description: `${APP_CONTEXT}Unified workout tool — start a session, log exercises, or log a full routine day. Combines start_session + log_exercise + log_routine into one.

Modes:
1. Session only: log_workout({}) — creates session, infers program day from weekday, returns plan + last workout.
2. Single exercise: log_workout({ exercise: "Bench Press", reps: 10, sets: 3, weight: 80 }) — auto-creates session if needed, logs the exercise.
3. Bulk exercises: log_workout({ exercises: [...] }) — logs multiple exercises at once.
4. Program day: log_workout({ program_day: "Push" }) — creates session, logs all exercises from that program day.
5. Program day with modifications: log_workout({ program_day: "Push", skip: ["curl"], overrides: [{exercise: "Bench", weight: 90}] })

If a session is already active, exercises are added to it. No auto-close — use end_session to close.

Parameters:
- program_day: day label to log (e.g. "Push"). If omitted and no exercises given, infers from today's weekday.
- date: ISO date string to backdate the session (e.g. "2025-01-28")
- tags: tags to label this session (e.g. ["deload", "morning"])
- notes: session-level notes
- overrides: array of { exercise, sets?, reps?, weight?, rpe? } to override program day template values
- skip: array of exercise names to skip from the program day
- exercise: name or alias of a single exercise to log
- sets: number of sets (default 1)
- reps: single number or array of numbers per set (e.g. [10, 8, 6])
- weight: weight in kg
- rpe: rate of perceived exertion 1-10
- set_type: "warmup", "working" (default), "drop", or "failure"
- exercise_notes: notes for the exercise
- rest_seconds: rest time in seconds
- muscle_group: muscle group for auto-created exercises
- equipment: equipment type for auto-created exercises
- set_notes: notes per set (string for all, or array per set)
- drop_percent: weight decrease per set for drop sets (1-50)
- rep_type: "reps", "seconds", "meters", or "calories"
- exercise_type: "strength", "mobility", "cardio", or "warmup"
- exercises: array of exercise entries for bulk logging
- include_last_workout: include last workout comparison (default true for session-only mode)
- minimal_response: return only success status and PRs`,
    inputSchema: {
      // Session control
      program_day: z.string().optional(),
      date: z.string().optional().describe("ISO date (e.g. '2025-01-28') to backdate the session"),
      tags: z.union([z.array(z.string()), z.string()]).optional().describe("Tags to label this session"),
      notes: z.string().optional().describe("Session-level notes"),

      // Program day overrides
      overrides: z.union([
        z.array(overrideSchema),
        z.string(),
      ]).optional(),
      skip: z.union([z.array(z.string()), z.string()]).optional(),

      // Single exercise mode
      exercise: z.string().optional(),
      sets: z.number().int().min(1).default(1),
      reps: z.union([z.number().int().min(1), z.array(z.number().int().min(1))]).optional(),
      weight: z.number().optional(),
      rpe: z.number().min(1).max(10).optional(),
      set_type: z.enum(["warmup", "working", "drop", "failure"]).default("working"),
      exercise_notes: z.string().optional().describe("Notes for the exercise (avoids collision with session notes)"),
      rest_seconds: z.number().int().optional(),
      muscle_group: z.string().optional(),
      equipment: z.string().optional(),
      set_notes: z.union([z.string(), z.array(z.string())]).optional(),
      drop_percent: z.number().min(1).max(50).optional(),
      rep_type: z.enum(["reps", "seconds", "meters", "calories"]).optional(),
      exercise_type: z.enum(["strength", "mobility", "cardio", "warmup"]).optional(),

      // Bulk mode
      exercises: z.union([z.array(exerciseEntrySchema), z.string()]).optional(),

      // Response control
      include_last_workout: z.boolean().optional(),
      minimal_response: z.boolean().optional().describe("If true, return only success status and new PRs"),
    },
    annotations: {},
    _meta: {
      "openai/toolInvocation/invoking": "Logging workout...",
      "openai/toolInvocation/invoked": "Workout logged",
    },
  }, safeHandler("log_workout", async (params) => {
    const userId = getUserId();
    const tags = parseJsonArrayParam<string>(params.tags);
    const overrides = parseJsonParam<any[]>(params.overrides);
    const skip = parseJsonArrayParam<string>(params.skip);
    const exercisesList = parseJsonParam<ExerciseEntry[]>(params.exercises);

    const hasExplicitExercise = !!params.exercise;
    const hasBulkExercises = exercisesList && Array.isArray(exercisesList) && exercisesList.length > 0;
    const hasProgramDay = !!params.program_day;
    const hasAnyExercises = hasExplicitExercise || hasBulkExercises;

    // --- 1. Resolve program day if needed ---
    let programVersionId: number | null = null;
    let programDayId: number | null = null;
    let dayInfo: any = null;
    let dayExercises: any[] = [];

    const activeProgram = await getActiveProgram();

    if (hasProgramDay || !hasAnyExercises) {
      // Need to resolve program day: either explicit or infer for session-only mode
      if (activeProgram) {
        programVersionId = activeProgram.version_id;

        if (params.program_day) {
          const { rows } = await pool.query(
            `SELECT pd.id, pd.day_label, pd.weekdays FROM program_days pd
             WHERE pd.version_id = $1 AND LOWER(pd.day_label) = LOWER($2) LIMIT 1`,
            [activeProgram.version_id, params.program_day]
          );
          if (rows.length > 0) {
            programDayId = rows[0].id;
            dayInfo = rows[0];
          }
        } else {
          // Infer from weekday
          const { rows: profileRows } = await pool.query(
            "SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1 LIMIT 1",
            [userId]
          );
          const timezone = profileRows[0]?.timezone || undefined;
          const inferred = await inferTodayDay(activeProgram.id, timezone);
          if (inferred) {
            programDayId = inferred.id;
            dayInfo = inferred;
          }
        }

        // If we have a program day and it was requested (explicit or session-only), get its exercises
        if (dayInfo && hasProgramDay) {
          const { rows } = await pool.query(
            `SELECT pde.*, e.name as exercise_name, e.id as exercise_id, e.exercise_type, pde.group_id, pde.section_id
             FROM program_day_exercises pde
             JOIN exercises e ON e.id = pde.exercise_id
             WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
            [dayInfo.id]
          );
          dayExercises = rows;
        }
      }

      // If program_day was explicitly requested but not found, error
      if (hasProgramDay && !dayInfo) {
        if (!activeProgram) {
          return toolResponse({ error: "No active program found" }, true);
        }
        return toolResponse({
          error: "No program day found. Specify a valid day label or check program weekday assignments.",
        }, true);
      }
    }

    // --- 2. Transaction ---
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // --- 3. Get or create session ---
      const activeSession = await client.query(
        "SELECT id, started_at, program_day_id FROM sessions WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
        [userId]
      );

      let sessionId: number;
      let sessionCreated = false;

      if (activeSession.rows.length > 0) {
        sessionId = activeSession.rows[0].id;

        // Link program_day_id if session doesn't have one and we resolved one
        if (!activeSession.rows[0].program_day_id && programDayId) {
          await client.query(
            "UPDATE sessions SET program_day_id = $1, program_version_id = COALESCE(program_version_id, $2) WHERE id = $3 AND user_id = $4",
            [programDayId, programVersionId, sessionId, userId]
          );
        }

        // Update tags if provided
        if (tags && tags.length > 0) {
          await client.query(
            "UPDATE sessions SET tags = $1 WHERE id = $2 AND user_id = $3",
            [tags, sessionId, userId]
          );
        }

        // Update notes if provided
        if (params.notes) {
          await client.query(
            "UPDATE sessions SET notes = COALESCE(notes || ' ' || $1, $1) WHERE id = $2 AND user_id = $3",
            [params.notes, sessionId, userId]
          );
        }
      } else {
        const startedAt = params.date ? new Date(params.date + 'T00:00:00') : new Date();
        const { rows: [newSession] } = await client.query(
          `INSERT INTO sessions (user_id, program_version_id, program_day_id, notes, started_at, tags)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, started_at`,
          [userId, programVersionId, programDayId, params.notes || null, startedAt, tags || []]
        );
        sessionId = newSession.id;
        sessionCreated = true;
      }

      // --- 4. Log program day exercises ---
      const routineResults: any[] = [];
      let totalRoutineSets = 0;
      let totalRoutineVolume = 0;
      const allPRs: any[] = [];

      if (hasProgramDay && dayExercises.length > 0) {
        // Build skip set
        const skipSet = new Set(
          (skip || []).map((s: string) => s.toLowerCase().trim())
        );

        // Build override map
        const overrideMap = new Map<string, any>();
        for (const o of overrides || []) {
          const resolved = await resolveExercise(o.exercise, undefined, undefined, undefined, undefined, client);
          overrideMap.set(resolved.name.toLowerCase(), o);
        }

        // Clone exercise groups from program day to session
        const groupMap = await cloneGroups(
          "program_exercise_groups", "session_exercise_groups",
          "day_id", "session_id",
          dayInfo.id, sessionId,
          client
        );

        // Clone sections from program day to session
        const sectionMap = await cloneSections(
          "program_sections", "session_sections",
          "day_id", "session_id",
          dayInfo.id, sessionId,
          client
        );

        for (const dex of dayExercises) {
          if (
            skipSet.has(dex.exercise_name.toLowerCase()) ||
            skipSet.has(dex.exercise_id.toString())
          ) {
            continue;
          }

          const override = overrideMap.get(dex.exercise_name.toLowerCase());
          const sets = override?.sets || dex.target_sets;
          const reps = override?.reps || dex.target_reps;
          const weight = override?.weight ?? dex.target_weight;
          const rpe = override?.rpe ?? dex.target_rpe;

          // Create session_exercise with remapped group_id and section_id
          const sessionGroupId = dex.group_id ? (groupMap.get(dex.group_id) ?? null) : null;
          const sessionSectionId = dex.section_id ? (sectionMap.get(dex.section_id) ?? null) : null;
          const { rows: [se] } = await client.query(
            `INSERT INTO session_exercises (session_id, exercise_id, sort_order, group_id, rest_seconds, section_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [sessionId, dex.exercise_id, dex.sort_order, sessionGroupId, dex.rest_seconds || null, sessionSectionId]
          );

          // Insert sets
          const setIds: number[] = [];
          for (let i = 0; i < sets; i++) {
            const { rows: [s] } = await client.query(
              `INSERT INTO sets (session_exercise_id, set_number, reps, weight, rpe)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [se.id, i + 1, reps, weight || null, rpe || null]
            );
            setIds.push(s.id);
          }

          totalRoutineSets += sets;
          if (weight) totalRoutineVolume += weight * reps * sets;

          // Check PRs
          const prs = await checkPRs(
            dex.exercise_id,
            setIds.map((id) => ({
              reps,
              weight: weight ?? null,
              set_id: id,
            })),
            dex.exercise_type,
            client
          );
          if (prs.length > 0) allPRs.push({ exercise: dex.exercise_name, prs });

          routineResults.push({
            exercise: dex.exercise_name,
            sets,
            reps,
            weight: weight || undefined,
            rpe: rpe || undefined,
          });
        }
      }

      // --- 5. Log explicit exercises ---
      const explicitResults: any[] = [];

      if (hasBulkExercises) {
        for (const entry of exercisesList!) {
          const result = await logSingleExercise(sessionId, entry, client);
          explicitResults.push(result);
          if (result.new_prs) allPRs.push(...result.new_prs.map((pr: any) => ({ exercise: result.exercise_name, ...pr })));
        }
      } else if (hasExplicitExercise) {
        if (!params.reps) {
          await client.query("ROLLBACK");
          return toolResponse({ error: "Reps required when logging an exercise" }, true);
        }

        const result = await logSingleExercise(sessionId, {
          exercise: params.exercise!,
          sets: params.sets,
          reps: params.reps,
          weight: params.weight,
          rpe: params.rpe,
          set_type: params.set_type,
          notes: params.exercise_notes,
          rest_seconds: params.rest_seconds,
          muscle_group: params.muscle_group,
          equipment: params.equipment,
          set_notes: params.set_notes,
          drop_percent: params.drop_percent,
          rep_type: params.rep_type,
          exercise_type: params.exercise_type,
        }, client);
        explicitResults.push(result);
        if (result.new_prs) allPRs.push(...result.new_prs.map((pr: any) => ({ exercise: result.exercise_name, ...pr })));
      }

      // --- 6. COMMIT ---
      await client.query("COMMIT");

      // --- 7. Session-only mode: return plan + last workout ---
      if (routineResults.length === 0 && explicitResults.length === 0) {
        const result: any = {
          session_id: sessionId,
          session_created: sessionCreated,
        };

        if (dayInfo) {
          // Get exercises for the plan
          const { rows: planExercises } = await pool.query(
            `SELECT e.name, pde.target_sets, pde.target_reps, pde.target_weight, pde.target_rpe, pde.rest_seconds, pde.notes
             FROM program_day_exercises pde
             JOIN exercises e ON e.id = pde.exercise_id
             WHERE pde.day_id = $1 ORDER BY pde.sort_order`,
            [programDayId]
          );
          result.program_day = {
            label: dayInfo.day_label,
            exercises: planExercises,
          };

          // Last workout comparison
          if (params.include_last_workout !== false) {
            const { rows: lastSession } = await pool.query(
              `SELECT s.id, s.started_at FROM sessions s
               WHERE s.user_id = $1 AND s.program_day_id = $2 AND s.id != $3 AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
               ORDER BY s.started_at DESC LIMIT 1`,
              [userId, programDayId, sessionId]
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
              const lastExercisesWithSummary = lastExercises.map((ex: any) => {
                const groups: Record<string, { count: number; reps: number[]; weight: number | null }> = {};
                for (const s of ex.sets || []) {
                  const key = `${s.set_type || 'working'}_${s.weight || 'bw'}`;
                  if (!groups[key]) groups[key] = { count: 0, reps: [], weight: s.weight };
                  groups[key].count++;
                  groups[key].reps.push(s.reps);
                }
                const parts = Object.entries(groups).map(([key, g]) => {
                  const type = key.split('_')[0];
                  const allSame = g.reps.every(r => r === g.reps[0]);
                  const repsStr = allSame ? `${g.count}x${g.reps[0]}` : g.reps.join(',');
                  const weightStr = g.weight ? `@${g.weight}kg` : '';
                  return `${repsStr}${weightStr} (${type})`;
                });
                return { ...ex, summary: parts.join(', ') };
              });
              result.last_workout = {
                date: lastSession[0].started_at,
                exercises: lastExercisesWithSummary,
              };
            }
          }
        }

        return toolResponse(result);
      }

      // --- 8. Return results + PRs ---
      if (params.minimal_response) {
        const totalLogged = routineResults.length + explicitResults.length;
        return toolResponse({
          success: true,
          session_id: sessionId,
          exercises_logged: totalLogged,
          new_prs: allPRs.length > 0 ? allPRs : undefined,
        });
      }

      const response: any = { session_id: sessionId };

      if (routineResults.length > 0) {
        response.day_label = dayInfo?.day_label;
        response.routine_exercises = routineResults;
        response.total_routine_sets = totalRoutineSets;
        response.total_routine_volume_kg = Math.round(totalRoutineVolume);
      }

      if (explicitResults.length === 1 && !hasBulkExercises) {
        // Single exercise — flatten into response
        Object.assign(response, explicitResults[0]);
      } else if (explicitResults.length > 0) {
        response.exercises_logged = explicitResults;
      }

      if (allPRs.length > 0) {
        response.new_prs = allPRs;
      }

      return toolResponse(response);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }));
}
