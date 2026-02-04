import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

type WidgetType = "ui" | "data" | "data-only";

const WIDGET_TOOLS: Record<string, { tool: string; args: Record<string, unknown>; type: WidgetType; file?: string }> = {
  // Display tools — render visual widgets (show_* tools)
  profile:             { tool: "show_profile", args: {}, type: "ui" },
  programs:            { tool: "show_program", args: {}, type: "ui" },
  "programs-user":     { tool: "show_programs", args: { mode: "user" }, type: "ui", file: "programs-list" },
  "programs-available": { tool: "show_programs", args: { mode: "available" }, type: "ui", file: "programs-list" },
  dashboard:           { tool: "show_dashboard", args: {}, type: "ui" },
  workout:             { tool: "show_workout", args: {}, type: "ui" },
  workouts:            { tool: "show_workouts", args: { period: "year" }, type: "ui" },
  // Data tools with widget HTML
  stats:         { tool: "get_stats", args: { exercise: "Bench Press", period: "3months" }, type: "data" },
  "today-plan":  { tool: "get_today_plan", args: {}, type: "data" },
  exercises:     { tool: "manage_exercises", args: { action: "list" }, type: "data" },
  measurements:  { tool: "manage_measurements", args: { action: "latest" }, type: "data" },
  export:        { tool: "export_data", args: { format: "json", scope: "all" }, type: "data" },
  // Data-only tools — no widget HTML, show raw JSON response
  "get-context":    { tool: "get_context", args: {}, type: "data-only" },
  "manage-profile": { tool: "manage_profile", args: { action: "get" }, type: "data-only" },
  "manage-program": { tool: "manage_program", args: { action: "list" }, type: "data-only" },
  "log-workout":    { tool: "log_workout", args: { exercise: "Bench Press", reps: 10, weight: 80 }, type: "data-only" },
  "end-workout":    { tool: "end_workout", args: {}, type: "data-only" },
  "get-workouts":   { tool: "get_workouts", args: { period: "month" }, type: "data-only" },
  "edit-workout":   { tool: "edit_workout", args: {}, type: "data-only" },
};

// Sample data fallback when server is not running
const sampleData: Record<string, { content?: Array<{ type: string; text: string }>; structuredContent?: any }> = {
  profile: {
    structuredContent: {
      profile: {
        name: "Francisco", gym: "SmartFit", age: 28, weight_kg: 82,
        height_cm: 178, training_days_per_week: 5,
        experience_level: "intermediate",
        available_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        goals: ["hypertrophy", "strength"],
        injuries: ["lower back"],
        preferred_units: "metric",
        supplements: "creatine, whey protein",
        sex: "male",
      },
      pendingChanges: {
        gym: "Iron Paradise",
        weight_kg: 85,
        goals: ["hypertrophy", "endurance"],
      },
    },
  },
  stats: {
    content: [{ type: "text", text: JSON.stringify({
      exercise: "Bench Press",
      personal_records: { max_weight: { value: "100kg" }, estimated_1rm: { value: "110kg" } },
      frequency: { sessions_per_week: 2.5, total_sessions: 48 },
      progression: [
        { date: "2025-01-01", weight: 80, reps: 10, estimated_1rm: 106.7 },
        { date: "2025-01-08", weight: 82.5, reps: 9, estimated_1rm: 107.3 },
        { date: "2025-01-15", weight: 85, reps: 8, estimated_1rm: 107.7 },
        { date: "2025-01-22", weight: 87.5, reps: 7, estimated_1rm: 107.9 },
      ],
    })}],
  },
  "today-plan": {
    content: [{ type: "text", text: JSON.stringify({
      day: "Push Day", program: "PPL",
      exercises: [
        { name: "Bench Press", target_sets: 4, target_reps: "8-10", target_weight: 85, target_rpe: 8 },
        { name: "OHP", target_sets: 3, target_reps: "8-10", target_weight: 50 },
        { name: "Incline DB Press", target_sets: 3, target_reps: "10-12", notes: "Slow eccentric" },
      ],
      last_workout: {
        date: "2025-01-20",
        exercises: [
          { name: "Bench Press", sets: [{ reps: 10, weight: 82.5 }, { reps: 9, weight: 85 }] },
        ],
      },
    })}],
  },
  exercises: {
    content: [{ type: "text", text: JSON.stringify({
      exercises: [
        { name: "Bench Press", muscle_group: "chest", equipment: "barbell" },
        { name: "Squat", muscle_group: "legs", equipment: "barbell" },
      ],
      total: 2,
    })}],
  },
  programs: {
    structuredContent: {
      initialDayIdx: 0,
      pendingChanges: { name: "Push Pull Legs v2", description: "Updated 6-day PPL split" },
      program: {
        id: 1, name: "Push Pull Legs", description: "6-day PPL split for hypertrophy", version: 2,
        is_active: true,
        days: [
          { day_label: "Push A", weekdays: [1, 4], exercises: [
            { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: 85, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest" },
            { exercise_name: "Overhead Press", target_sets: 3, target_reps: 10, target_weight: 50, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "shoulders" },
            { exercise_name: "Cable Fly", target_sets: 3, target_reps: 12, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "chest" },
            { exercise_name: "Lateral Raise", target_sets: 3, target_reps: 15, target_weight: 12, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders" },
            { exercise_name: "Tricep Pushdown", target_sets: 3, target_reps: 12, target_weight: 25, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: "Rope attachment", muscle_group: "triceps" },
          ]},
        ],
      },
    },
  },
  measurements: {
    content: [{ type: "text", text: JSON.stringify({
      measurements: [{ type: "weight_kg", value: 82, date: "2025-01-28" }],
    })}],
  },
  "programs-user": {
    content: [{ type: "text", text: JSON.stringify({
      mode: "user",
      programs: [
        { id: 1, name: "Upper/Lower 4x", is_active: true, description: "4 days/week upper/lower split", version: 2, days: [
          { day_label: "Upper A", weekdays: [1], exercises: [
            { exercise_name: "Bench Press", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
            { exercise_name: "Barbell Row", target_sets: 4, target_reps: 8, target_weight: 70, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Lateral Raise", target_sets: 3, target_reps: 15, target_weight: 10, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            { exercise_name: "Face Pull", target_sets: 3, target_reps: 15, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders", rep_type: "reps" },
          ]},
          { day_label: "Lower A", weekdays: [2], exercises: [
            { exercise_name: "Squat", target_sets: 4, target_reps: 6, target_weight: 100, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Romanian Deadlift", target_sets: 3, target_reps: 10, target_weight: 80, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Leg Curl", target_sets: 3, target_reps: 12, target_weight: 40, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: null, muscle_group: "legs", rep_type: "reps" },
          ]},
          { day_label: "Upper B", weekdays: [4], exercises: [
            { exercise_name: "Overhead Press", target_sets: 4, target_reps: 6, target_weight: 50, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            { exercise_name: "Pull-Up", target_sets: 4, target_reps: 8, target_weight: null, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Tricep Pushdown", target_sets: 3, target_reps: 12, target_weight: 25, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "arms", rep_type: "reps" },
            { exercise_name: "Bicep Curl", target_sets: 3, target_reps: 12, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "arms", rep_type: "reps" },
          ]},
          { day_label: "Lower B", weekdays: [5], exercises: [
            { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: 120, target_rpe: 9, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Leg Press", target_sets: 3, target_reps: 10, target_weight: 150, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Calf Raise", target_sets: 4, target_reps: 15, target_weight: 60, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: null, muscle_group: "legs", rep_type: "reps" },
          ]},
        ]},
      ],
    })}],
  },
  "programs-available": {
    content: [{ type: "text", text: JSON.stringify({
      mode: "available",
      profile: { experience_level: "intermediate", training_days_per_week: 4 },
      clonedNames: ["Upper/Lower 4x"],
      programs: [
        { id: 100, name: "Full Body 3x", description: "3 days/week full body routine.", version: 1, days_per_week: 3,
          days: [
            { day_label: "Full Body A", weekdays: [1], exercises: [
              { exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Bench Press", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Barbell Row", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Full Body B", weekdays: [3], exercises: [
              { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Incline Bench Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
            ]},
            { day_label: "Full Body C", weekdays: [5], exercises: [
              { exercise_name: "Leg Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Bench Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
            ]},
          ]},
        { id: 101, name: "Upper/Lower 4x", description: "4 days/week upper/lower split.", version: 1, days_per_week: 4,
          days: [
            { day_label: "Upper A", weekdays: [1], exercises: [
              { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Barbell Row", target_sets: 4, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Lower A", weekdays: [2], exercises: [
              { exercise_name: "Squat", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Romanian Deadlift", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "hamstrings", rep_type: "reps" },
            ]},
          ]},
        { id: 102, name: "Push Pull Legs 6x", description: "6 days/week PPL split.", version: 1, days_per_week: 6,
          days: [
            { day_label: "Push A", weekdays: [1], exercises: [
              { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Overhead Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            ]},
            { day_label: "Pull A", weekdays: [2], exercises: [
              { exercise_name: "Barbell Row", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Pull-Up", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
          ]},
      ],
    })}],
  },
  export: {
    content: [{ type: "text", text: JSON.stringify({
      format: "json", scope: "all",
      data: { sessions: 48, exercises: 16, programs: 1 },
    })}],
  },
  workout: {
    content: [{ type: "text", text: JSON.stringify({
      session: {
        session_id: 42,
        started_at: new Date(Date.now() - 45 * 60000).toISOString(),
        duration_minutes: 45,
        program_day: "Push A",
        tags: ["morning"],
        exercises: [
          {
            name: "Bench Press",
            superset_group: null,
            muscle_group: "chest",
            exercise_type: "strength",
            rep_type: "reps",
            sets: [
              { set_id: 101, set_number: 1, reps: 10, weight: 80, rpe: 7, set_type: "working", logged_at: new Date(Date.now() - 40 * 60000).toISOString() },
              { set_id: 102, set_number: 2, reps: 8, weight: 85, rpe: 8, set_type: "working", logged_at: new Date(Date.now() - 35 * 60000).toISOString() },
              { set_id: 103, set_number: 3, reps: 6, weight: 90, rpe: 9, set_type: "working", logged_at: new Date(Date.now() - 30 * 60000).toISOString() },
            ],
            previous: {
              date: new Date(Date.now() - 3 * 86400000).toISOString(),
              sets: [
                { set_number: 1, reps: 10, weight: 75, rpe: 7, set_type: "working" },
                { set_number: 2, reps: 8, weight: 80, rpe: 8, set_type: "working" },
                { set_number: 3, reps: 6, weight: 85, rpe: 9, set_type: "working" },
              ],
            },
            prs: { max_weight: 90, estimated_1rm: 108 },
            pr_baseline: { max_weight: 87.5, estimated_1rm: 106 },
          },
          {
            name: "Incline DB Press",
            superset_group: null,
            muscle_group: "chest",
            exercise_type: "strength",
            rep_type: "reps",
            sets: [
              { set_id: 104, set_number: 1, reps: 12, weight: 30, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 20 * 60000).toISOString() },
              { set_id: 105, set_number: 2, reps: 10, weight: 32, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 15 * 60000).toISOString() },
            ],
            previous: null,
            prs: null,
          },
          {
            name: "Cable Fly",
            superset_group: 1,
            muscle_group: "chest",
            exercise_type: "strength",
            rep_type: "reps",
            sets: [
              { set_id: 106, set_number: 1, reps: 15, weight: 15, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 8 * 60000).toISOString() },
              { set_id: 107, set_number: 2, reps: 12, weight: 15, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 5 * 60000).toISOString() },
            ],
            previous: {
              date: new Date(Date.now() - 3 * 86400000).toISOString(),
              sets: [
                { set_number: 1, reps: 15, weight: 12.5, rpe: null, set_type: "working" },
              ],
            },
            prs: null,
          },
          {
            name: "Lateral Raise",
            superset_group: 1,
            muscle_group: "shoulders",
            exercise_type: "strength",
            rep_type: "reps",
            sets: [
              { set_id: 108, set_number: 1, reps: 15, weight: 10, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 7 * 60000).toISOString() },
              { set_id: 109, set_number: 2, reps: 12, weight: 10, rpe: null, set_type: "working", logged_at: new Date(Date.now() - 3 * 60000).toISOString() },
            ],
            previous: null,
            prs: null,
          },
        ],
      },
    })}],
  },
  workouts: {
    content: [{ type: "text", text: JSON.stringify({
      sessions: [
        {
          session_id: 42, started_at: new Date(Date.now() - 2 * 3600000).toISOString(),
          ended_at: new Date(Date.now() - 1 * 3600000).toISOString(),
          program_day: "Push A", tags: ["morning"],
          exercises_count: 5, total_sets: 18, total_volume_kg: 12450,
          muscle_groups: ["chest", "shoulders", "triceps"],
          exercise_names: ["Bench Press", "Incline Bench Press", "Overhead Press", "Tricep Pushdown", "Lateral Raise"],
        },
        {
          session_id: 41, started_at: new Date(Date.now() - 26 * 3600000).toISOString(),
          ended_at: new Date(Date.now() - 25 * 3600000).toISOString(),
          program_day: "Pull A", tags: [],
          exercises_count: 4, total_sets: 16, total_volume_kg: 10200,
          muscle_groups: ["back", "biceps"],
          exercise_names: ["Barbell Row", "Lat Pulldown", "Seated Cable Row", "Barbell Curl"],
        },
        {
          session_id: 40, started_at: new Date(Date.now() - 50 * 3600000).toISOString(),
          ended_at: new Date(Date.now() - 49 * 3600000).toISOString(),
          program_day: "Legs", tags: ["heavy"],
          exercises_count: 6, total_sets: 22, total_volume_kg: 18300,
          muscle_groups: ["quads", "hamstrings", "glutes", "calves"],
          exercise_names: ["Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Calf Raise", "Barbell Lunge"],
        },
      ],
      summary: { total_sessions: 3, total_volume_kg: 40950, exercises_count: 15 },
      filters: { period: "month" },
    })}],
  },
  dashboard: {
    structuredContent: {
      period: "3months",
      streak: { current_weeks: 6, longest_weeks: 12, this_week: 2, target: 1 },
      volume_weekly: [
        { week: "2024-11-25", volume: 12000 },
        { week: "2024-12-02", volume: 14500 },
        { week: "2024-12-09", volume: 11800 },
        { week: "2024-12-16", volume: 15200 },
        { week: "2024-12-23", volume: 13100 },
        { week: "2024-12-30", volume: 16000 },
        { week: "2025-01-06", volume: 14800 },
        { week: "2025-01-13", volume: 17200 },
      ],
      frequency: {
        avg_per_week: 3.5, total: 28,
        weekly: [
          { week: "2024-11-25", count: 3 }, { week: "2024-12-02", count: 4 },
          { week: "2024-12-09", count: 3 }, { week: "2024-12-16", count: 4 },
          { week: "2024-12-23", count: 3 }, { week: "2024-12-30", count: 4 },
          { week: "2025-01-06", count: 3 }, { week: "2025-01-13", count: 4 },
        ],
      },
      recent_prs: [
        { exercise: "Bench Press", record_type: "max_weight", value: 100, achieved_at: "2025-01-12" },
        { exercise: "Squat", record_type: "estimated_1rm", value: 155, achieved_at: "2025-01-10" },
        { exercise: "Deadlift", record_type: "max_weight", value: 180, achieved_at: "2025-01-08" },
        { exercise: "OHP", record_type: "max_reps_at_weight", value: 12, achieved_at: "2025-01-05" },
        { exercise: "Barbell Row", record_type: "max_weight", value: 90, achieved_at: "2025-01-02" },
      ],
      muscle_groups: [
        { muscle_group: "chest", volume: 24000, sets: 80 },
        { muscle_group: "back", volume: 22000, sets: 75 },
        { muscle_group: "legs", volume: 28000, sets: 90 },
        { muscle_group: "shoulders", volume: 12000, sets: 50 },
        { muscle_group: "arms", volume: 8000, sets: 40 },
      ],
      body_weight: [
        { value: 83.2, measured_at: "2024-11-25" },
        { value: 83.0, measured_at: "2024-12-02" },
        { value: 82.5, measured_at: "2024-12-09" },
        { value: 82.8, measured_at: "2024-12-16" },
        { value: 82.2, measured_at: "2024-12-23" },
        { value: 81.9, measured_at: "2024-12-30" },
        { value: 82.0, measured_at: "2025-01-06" },
        { value: 81.5, measured_at: "2025-01-13" },
      ],
      top_exercises: [
        { exercise: "Squat", volume: 28000, sessions: 12 },
        { exercise: "Bench Press", volume: 24000, sessions: 14 },
        { exercise: "Deadlift", volume: 22000, sessions: 8 },
        { exercise: "Barbell Row", volume: 15000, sessions: 10 },
        { exercise: "OHP", volume: 10000, sessions: 10 },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Device presets
// ---------------------------------------------------------------------------

interface DevicePreset {
  label: string;
  width: number | null; // null = responsive (100%)
  height: number | null;
}

const DEVICE_PRESETS: DevicePreset[] = [
  { label: "Responsive", width: null, height: null },
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "iPhone Pro", width: 390, height: 844 },
  { label: "iPad", width: 768, height: 1024 },
  { label: "Desktop", width: 1280, height: 800 },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const MCP_SERVER_URL = "/mcp";

const logEl = document.getElementById("log") as HTMLPreElement;
const frame = document.getElementById("widget-frame") as HTMLIFrameElement;
const statusDot = document.getElementById("status-dot") as HTMLSpanElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const modeLabel = document.getElementById("mode-label") as HTMLSpanElement;
const deviceSelect = document.getElementById("device-select") as HTMLSelectElement;
const deviceFrame = document.getElementById("device-frame") as HTMLDivElement;
const navContainer = document.getElementById("widget-nav") as HTMLDivElement;

type HostMode = "mcp-apps" | "openai";

let currentTheme: "light" | "dark" = "light";
let currentWidget = "profile";
let currentBridge: AppBridge | null = null;
let mcpClient: Client | null = null;
let isLiveMode = false;
let currentFrameLoadHandler: (() => void) | null = null;
let currentHostMode: HostMode = "mcp-apps";
const hostModeLabel = document.getElementById("host-mode-label") as HTMLSpanElement;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(label: string, data?: unknown) {
  const time = new Date().toLocaleTimeString();
  const text = data ? JSON.stringify(data, null, 2).slice(0, 500) : "";
  logEl.textContent += `[${time}] ${label}\n${text}\n\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function removeAllChildren(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setConnectionStatus(connected: boolean) {
  if (statusDot) {
    statusDot.style.background = connected ? "#22c55e" : "#ef4444";
  }
  if (statusText) {
    statusText.textContent = connected ? "Connected" : "Disconnected";
  }
}

function updateModeLabel() {
  if (modeLabel) {
    modeLabel.textContent = isLiveMode ? "LIVE" : "Sample";
    modeLabel.style.color = isLiveMode ? "#22c55e" : "#f59e0b";
  }
}

function applyDevicePreset(preset: DevicePreset) {
  if (!deviceFrame || !frame) return;
  if (preset.width === null) {
    deviceFrame.style.width = "100%";
    deviceFrame.style.maxWidth = "none";
    frame.style.height = "700px";
  } else {
    deviceFrame.style.width = `${preset.width}px`;
    deviceFrame.style.maxWidth = `${preset.width}px`;
    frame.style.height = `${preset.height}px`;
  }
}

// ---------------------------------------------------------------------------
// Build dynamic widget nav buttons
// ---------------------------------------------------------------------------

function buildWidgetNav() {
  if (!navContainer) return;
  removeAllChildren(navContainer);

  const groups: { label: string; type: WidgetType }[] = [
    { label: "Display (UI)", type: "ui" },
    { label: "Data (Widget)", type: "data" },
    { label: "Data Only (JSON)", type: "data-only" },
  ];

  for (const group of groups) {
    const header = document.createElement("div");
    header.className = "nav-section";
    header.textContent = group.label;
    navContainer.appendChild(header);

    for (const [name, entry] of Object.entries(WIDGET_TOOLS)) {
      if (entry.type !== group.type) continue;
      const btn = document.createElement("button");
      btn.className = "nav-btn" + (name === currentWidget ? " active" : "");
      btn.textContent = name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      btn.addEventListener("click", () => loadWidget(name));
      navContainer.appendChild(btn);
    }
  }
}

// ---------------------------------------------------------------------------
// Build device dropdown
// ---------------------------------------------------------------------------

function buildDeviceDropdown() {
  if (!deviceSelect) return;
  removeAllChildren(deviceSelect);
  for (const preset of DEVICE_PRESETS) {
    const opt = document.createElement("option");
    opt.value = preset.label;
    opt.textContent = preset.label + (preset.width ? ` (${preset.width}\u00D7${preset.height})` : "");
    deviceSelect.appendChild(opt);
  }
  deviceSelect.addEventListener("change", () => {
    const preset = DEVICE_PRESETS.find((p) => p.label === deviceSelect.value);
    if (preset) applyDevicePreset(preset);
  });
}

// ---------------------------------------------------------------------------
// MCP client
// ---------------------------------------------------------------------------

async function connectMcpClient(): Promise<Client | null> {
  try {
    const client = new Client({ name: "TestHost", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL, window.location.origin));
    await client.connect(transport);
    log("MCP client connected via proxy");
    setConnectionStatus(true);
    return client;
  } catch (err) {
    log("MCP server not available, using sample data", err instanceof Error ? err.message : err);
    setConnectionStatus(false);
    return null;
  }
}

async function callToolViaClient(client: Client, toolName: string, args: Record<string, unknown>): Promise<any> {
  log(`Calling tool: ${toolName}`, args);
  const result = await client.callTool({ name: toolName, arguments: args });
  log(`Tool result received`, result);
  return result;
}

// ---------------------------------------------------------------------------
// Host context (theme + styles for widgets)
// ---------------------------------------------------------------------------

function getHostContext() {
  const darkVars = {
    "--color-background-primary": "#1a1a1a",
    "--color-background-secondary": "#2a2a2a",
    "--color-text-primary": "#e5e5e5",
    "--color-text-secondary": "#a0a0a0",
    "--color-border-primary": "#3a3a3a",
  };
  const lightVars = {
    "--color-background-primary": "#ffffff",
    "--color-background-secondary": "#f5f5f5",
    "--color-text-primary": "#1a1a1a",
    "--color-text-secondary": "#666666",
    "--color-border-primary": "#e0e0e0",
  };
  return {
    theme: currentTheme,
    styles: { variables: currentTheme === "dark" ? darkVars : lightVars } as any,
  };
}

// ---------------------------------------------------------------------------
// Bridge connection
// ---------------------------------------------------------------------------

async function connectBridge() {
  if (currentBridge) {
    try { await currentBridge.close(); } catch { /* ignore */ }
    currentBridge = null;
  }

  if (!mcpClient) {
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    updateModeLabel();
  }

  const bridge = new AppBridge(
    mcpClient,
    { name: "TestHost", version: "1.0.0" },
    { openLinks: {}, serverTools: {}, logging: {} },
    { hostContext: getHostContext() },
  );

  bridge.oninitialized = async () => {
    log("Widget initialized, fetching data...");

    let data: any;
    if (mcpClient && WIDGET_TOOLS[currentWidget]) {
      try {
        const { tool, args } = WIDGET_TOOLS[currentWidget];
        data = await callToolViaClient(mcpClient, tool, args);
      } catch (err) {
        log("Tool call failed, falling back to sample data", err instanceof Error ? err.message : err);
        data = sampleData[currentWidget];
      }
    } else {
      data = sampleData[currentWidget];
    }

    bridge.sendToolInput({ arguments: {} });
    bridge.sendToolResult(data);
    log("Data sent to widget", { mode: isLiveMode ? "live" : "sample" });
  };

  bridge.onsizechange = ({ height }) => {
    // Only auto-resize in responsive mode
    const preset = DEVICE_PRESETS.find((p) => p.label === deviceSelect?.value);
    if (preset?.width === null && height != null) {
      frame.style.height = `${Math.min(height + 40, 1200)}px`;
    }
  };

  bridge.onloggingmessage = ({ level, logger, data }) => {
    log(`[${logger ?? "Widget"}] ${level}`, data);
  };

  currentBridge = bridge;

  // Remove previous listener to avoid accumulation across loadWidget calls
  if (currentFrameLoadHandler) {
    frame.removeEventListener("load", currentFrameLoadHandler);
  }

  const loadHandler = async () => {
    if (!frame.contentWindow) return;
    const transport = new PostMessageTransport(
      frame.contentWindow,
      frame.contentWindow,
    );
    try {
      await bridge.connect(transport);
      log("Bridge connected via PostMessageTransport");
    } catch (err) {
      log("Bridge connect error", err instanceof Error ? err.message : err);
    }
  };
  currentFrameLoadHandler = loadHandler;
  frame.addEventListener("load", loadHandler);
}

// ---------------------------------------------------------------------------
// OpenAI simulation mode
// ---------------------------------------------------------------------------

function parseToolContentForHost(result: any): any {
  if (result?.structuredContent) return result.structuredContent;
  const textContent = result?.content?.find((c: any) => c.type === "text");
  if (textContent?.text) {
    try { return JSON.parse(textContent.text); } catch { return textContent.text; }
  }
  return result;
}

async function loadWidgetOpenAi(name: string) {
  // Ensure MCP client for live data
  if (!mcpClient) {
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    updateModeLabel();
  }

  const entry = WIDGET_TOOLS[name];
  let toolResult: any;
  if (mcpClient && entry) {
    try {
      toolResult = await callToolViaClient(mcpClient, entry.tool, entry.args);
    } catch (err) {
      log("Tool call failed, falling back to sample data", err instanceof Error ? err.message : err);
      toolResult = sampleData[name];
    }
  } else {
    toolResult = sampleData[name];
  }

  const parsedOutput = parseToolContentForHost(toolResult);

  // Remove previous frame load handler
  if (currentFrameLoadHandler) {
    frame.removeEventListener("load", currentFrameLoadHandler);
    currentFrameLoadHandler = null;
  }

  // Set up load handler that injects window.openai mock
  const loadHandler = () => {
    const win = frame.contentWindow as any;
    if (!win) return;

    // In-memory widget state
    let widgetState: any = null;

    // Build the mock window.openai object
    const openaiMock = {
      toolOutput: parsedOutput,
      toolInput: entry?.args ?? {},
      toolResponseMetadata: toolResult?._meta ?? null,
      widgetState,
      theme: currentTheme,
      locale: "en-US",
      displayMode: "inline" as const,
      maxHeight: 1200,
      safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
      userAgent: "TestHost/1.0",
      view: "default",
      callTool: async (toolName: string, args: Record<string, unknown>) => {
        if (!mcpClient) return { content: [{ type: "text", text: "No MCP client" }] };
        const result = await callToolViaClient(mcpClient, toolName, args);
        // After a tool call, update toolOutput and fire event
        const newParsed = parseToolContentForHost(result);
        openaiMock.toolOutput = newParsed;
        win.dispatchEvent(new CustomEvent("openai:set_globals", {
          detail: { globals: { toolOutput: newParsed } },
        }));
        return result;
      },
      sendFollowUpMessage: async (opts: any) => {
        log("sendFollowUpMessage", opts);
      },
      notifyIntrinsicHeight: (height: number) => {
        const preset = DEVICE_PRESETS.find((p) => p.label === deviceSelect?.value);
        if (preset?.width === null) {
          frame.style.height = `${Math.min(height + 40, 1200)}px`;
        }
      },
      setWidgetState: (state: any) => {
        widgetState = state;
        openaiMock.widgetState = state;
        win.dispatchEvent(new CustomEvent("openai:set_globals", {
          detail: { globals: { widgetState: state } },
        }));
      },
      requestDisplayMode: (opts: any) => { log("requestDisplayMode", opts); },
      openExternal: (url: string) => { log("openExternal", url); },
      uploadFile: async () => ({ fileId: "mock-file-id" }),
      getFileDownloadUrl: async () => "https://example.com/mock-download",
    };

    // Inject window.openai into the iframe
    win.openai = openaiMock;

    // Fire the set_globals event to trigger widget initialization
    win.dispatchEvent(new CustomEvent("openai:set_globals", {
      detail: { globals: openaiMock },
    }));

    log("OpenAI mock injected into iframe", { theme: currentTheme, dataKeys: parsedOutput ? Object.keys(parsedOutput) : null });
  };

  currentFrameLoadHandler = loadHandler;
  frame.addEventListener("load", loadHandler);

  // Load the widget HTML (use file override if specified)
  const fileName = WIDGET_TOOLS[name]?.file ?? name;
  frame.removeAttribute("srcdoc");
  frame.src = `/${fileName}.html`;
}

// ---------------------------------------------------------------------------
// Public API (exposed to HTML)
// ---------------------------------------------------------------------------

async function loadWidget(name: string) {
  currentWidget = name;

  // Update active state on nav buttons
  navContainer?.querySelectorAll(".nav-btn").forEach((b) => {
    const matches = b.textContent?.toLowerCase().replace(/ /g, "-") === name;
    b.classList.toggle("active", matches);
  });

  logEl.textContent = `// Loading ${name} (${currentHostMode})...\n`;

  const entry = WIDGET_TOOLS[name];

  if (entry?.type === "data-only") {
    // No widget HTML — call tool directly and show raw JSON
    await loadDataOnly(name, entry);
  } else if (currentHostMode === "openai") {
    await loadWidgetOpenAi(name);
  } else {
    await connectBridge();
    // Clear srcdoc from any previous data-only view, then set src (use file override if specified)
    const fileName = entry?.file ?? name;
    frame.removeAttribute("srcdoc");
    frame.src = `/${fileName}.html`;
  }
}

async function loadDataOnly(name: string, entry: { tool: string; args: Record<string, unknown> }) {
  // Ensure MCP client is connected
  if (!mcpClient) {
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    updateModeLabel();
  }

  let result: any;
  if (mcpClient) {
    try {
      result = await callToolViaClient(mcpClient, entry.tool, entry.args);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
      log("Tool call failed", result.error);
    }
  } else {
    result = sampleData[name] ?? { info: "No sample data. Start the MCP server for live results." };
  }

  // Render JSON in the iframe via srcdoc
  const json = JSON.stringify(result, null, 2);
  const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  frame.srcdoc = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; padding: 16px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 13px; background: #0d1117; color: #c9d1d9; }
  .tool-name { color: #7ee787; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  pre { white-space: pre-wrap; word-break: break-all; margin: 0; }
</style></head><body>
  <div class="tool-name">${entry.tool}</div>
  <pre>${escaped}</pre>
</body></html>`;
}

(window as any).loadWidget = loadWidget;

(window as any).toggleTheme = async function toggleTheme() {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  const themeLabel = document.getElementById("theme-label");
  if (themeLabel) themeLabel.textContent = currentTheme === "dark" ? "Dark" : "Light";

  // Reload widget with new theme
  loadWidget(currentWidget);
};

(window as any).toggleHostMode = function toggleHostMode() {
  currentHostMode = currentHostMode === "mcp-apps" ? "openai" : "mcp-apps";
  if (hostModeLabel) {
    hostModeLabel.textContent = currentHostMode === "openai" ? "OpenAI" : "MCP Apps";
  }
  log(`Host mode: ${currentHostMode}`);
  loadWidget(currentWidget);
};

(window as any).toggleMode = async function toggleMode() {
  if (isLiveMode) {
    if (mcpClient) {
      try { await mcpClient.close(); } catch { /* ignore */ }
      mcpClient = null;
    }
    isLiveMode = false;
    setConnectionStatus(false);
  } else {
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    if (!isLiveMode) {
      log("Cannot switch to live mode — server not available");
    }
  }
  updateModeLabel();
  loadWidget(currentWidget);
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

buildWidgetNav();
buildDeviceDropdown();
applyDevicePreset(DEVICE_PRESETS[0]);
loadWidget("profile");
