/**
 * API Specification for the unified `api` tool.
 * The LLM reads this to understand available endpoints.
 */

export const API_SPEC = `
# Gym Tracker API

Base: All endpoints are called via the \`api\` tool with { method, path, body }.

## Context & Profile

### GET /context
MANDATORY first call. Returns full user context.
Response: { profile, program, active_workout, has_history, required_action, suggestion }
- required_action: "setup_profile" | "choose_program" | null — follow this!

### GET /profile
Get user profile data.
Response: { profile: Record<string, any> }

### PATCH /profile
Update user profile (merges with existing).
Body: { name?, age?, sex?, weight_kg?, height_cm?, goals?, experience_level?, training_days_per_week?, available_days?, injuries?, preferred_units?, gym?, supplements?, requires_validation? }
Response: { profile }

## Exercises

### GET /exercises
List all exercises. Supports pagination.
Query (in body): { muscle_group?, limit?, offset? }
Response: { exercises, total }

### GET /exercises/search
Search exercises by name/alias.
Body: { query, muscle_group? }
Response: { exercises }

### POST /exercises
Add a new exercise.
Body: { name, muscle_group?, equipment?, aliases?, rep_type?, exercise_type? }
Response: { exercise, is_new }

### POST /exercises/bulk
Add multiple exercises.
Body: { exercises: [{ name, muscle_group?, equipment?, aliases?, rep_type?, exercise_type? }] }
Response: { created, existing, failed, total }

### PATCH /exercises/:name
Update an exercise (user-owned only).
Body: { muscle_group?, equipment?, rep_type?, exercise_type? }
Response: { updated }

### DELETE /exercises/:name
Delete an exercise (user-owned only).
Response: { deleted }

### POST /exercises/merge
Merge two exercises.
Body: { source, target }
Response: { merged }

## Programs

### GET /programs
List user's programs.
Response: { programs }

### GET /programs/available
List global template programs (for cloning).
Response: { programs }

### GET /programs/:id
Get program details with days and exercises.
Response: { program }

### POST /programs
Create a new program.
Body: { name, days: [{ day_label, weekdays?, exercises: [{ exercise, target_sets, target_reps, target_weight?, target_rpe?, rest_seconds?, notes? }] }] }
Response: { program }

### POST /programs/:id/clone
Clone a program (global or own).
Body: { name? }
Response: { program }

### PATCH /programs/:id
Update program metadata.
Body: { name?, is_active? }
Response: { program }

### PATCH /programs/:id/exercises/:exerciseId
Update a specific exercise in the program.
Body: { target_sets?, target_reps?, target_weight?, target_rpe?, rest_seconds?, notes? }
Response: { updated }

### DELETE /programs/:id
Delete a program.
Response: { deleted }

### POST /programs/:id/activate
Activate a program (deactivates others).
Response: { activated }

## Workouts

### POST /workouts
Start a workout or log exercises.
Body: {
  program_day?: string,      // Log entire program day
  date?: string,             // Backdate (ISO)
  tags?: string[],
  notes?: string,
  exercise?: string,         // Single exercise
  sets?: number,
  reps?: number | number[],
  weight?: number,
  rpe?: number,
  exercises?: [{             // Bulk exercises
    exercise, sets?, reps, weight?, rpe?, set_type?, notes?
  }],
  skip?: string[],           // Skip exercises from program day
  overrides?: [{ exercise, sets?, reps?, weight?, rpe? }]
}
Response: { session_id, session_created?, routine_exercises?, exercises_logged?, new_prs? }

### POST /workouts/end
End active workout.
Body: { notes?, force?, tags? }
Response: { summary, comparison? }

### GET /workouts
Get workout history.
Query (in body): { period?, exercise?, program_day?, tags?, workout_id?, limit?, offset?, summary_only?, include_sets? }
Response: { sessions, summary }

### GET /workouts/today
Get today's planned workout (read-only, no session created).
Response: { day_label, exercises, last_workout? }

### PATCH /workouts/:id
Edit a workout session.
Body: {
  action: "update_set" | "delete_set" | "add_set" | "update_session" | "delete_workout" | "restore_workout" | "validate_workout",
  exercise?: string,
  set_index?: number,        // 1-based, or negative (-1 = last)
  data?: { reps?, weight?, rpe?, set_type?, notes? }
}
Response: varies by action

### DELETE /workouts/:id
Soft-delete a workout.
Response: { deleted }

## Stats

### GET /stats
Get exercise statistics.
Body: { exercise?: string, exercises?: string[], period?: "week"|"month"|"3months"|"year"|"all" }
Response: { stats } — PRs, progression, volume, frequency

## Measurements

### POST /measurements
Log a body measurement.
Body: { type: "weight_kg"|"body_fat_pct"|"chest_cm"|..., value: number, measured_at?, notes? }
Response: { measurement }

### GET /measurements
Get measurement history.
Body: { type?, period?, limit? }
Response: { measurements }

### GET /measurements/latest
Get latest measurements (one per type).
Response: { measurements }

## Export

### GET /export
Export user data.
Body: { format: "json"|"csv", scope?: "all"|"sessions"|"exercises"|"programs"|"measurements"|"prs", period?: number }
Response: { data } or { csv }
`;
