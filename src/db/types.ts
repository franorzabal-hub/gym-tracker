/**
 * Database row types for gym-tracker.
 * These interfaces match the database schema and provide type safety for query results.
 */

// ─── Core Types ────────────────────────────────────────────────────────────

export type RepType = "reps" | "seconds" | "meters" | "calories";
export type ExerciseType = "strength" | "mobility" | "cardio" | "warmup";
export type SetType = "warmup" | "working" | "drop" | "failure";
export type GroupType = "superset" | "paired" | "circuit";

// ─── User Tables ───────────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  external_id: string;
  email: string;
  created_at: Date;
  last_login: Date;
}

export interface UserProfileRow {
  user_id: number;
  data: Record<string, unknown>;
}

// ─── Exercise Tables ───────────────────────────────────────────────────────

export interface ExerciseRow {
  id: number;
  user_id: number | null;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  rep_type: RepType;
  exercise_type: ExerciseType;
  description: string | null;
}

export interface ExerciseAliasRow {
  exercise_id: number;
  alias: string;
}

export interface ExerciseWithAliases extends ExerciseRow {
  aliases: string[];
}

// ─── Program Tables ────────────────────────────────────────────────────────

export interface ProgramRow {
  id: number;
  user_id: number | null;
  name: string;
  description: string | null;
  is_active: boolean;
  is_validated: boolean;
  created_at: Date;
}

export interface ProgramVersionRow {
  id: number;
  program_id: number;
  version_number: number;
  change_description: string | null;
  created_at: Date;
}

export interface ProgramDayRow {
  id: number;
  version_id: number;
  day_label: string;
  weekdays: number[] | null;
  sort_order: number;
}

export interface ProgramDayExerciseRow {
  id: number;
  day_id: number;
  exercise_id: number;
  sort_order: number;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  target_reps_per_set: number[] | null;
  target_weight_per_set: number[] | null;
  rest_seconds: number | null;
  notes: string | null;
  group_id: number | null;
  section_id: number | null;
}

export interface ProgramExerciseGroupRow {
  id: number;
  day_id: number;
  group_type: GroupType;
  label: string | null;
  notes: string | null;
  rest_seconds: number | null;
  sort_order: number;
}

export interface ProgramSectionRow {
  id: number;
  day_id: number;
  label: string;
  notes: string | null;
  sort_order: number;
}

// ─── Session Tables ────────────────────────────────────────────────────────

export interface SessionRow {
  id: number;
  user_id: number;
  program_version_id: number | null;
  program_day_id: number | null;
  started_at: Date;
  ended_at: Date | null;
  notes: string | null;
  tags: string[];
  deleted_at: Date | null;
  is_validated: boolean;
}

export interface SessionExerciseRow {
  id: number;
  session_id: number;
  exercise_id: number;
  sort_order: number;
  rest_seconds: number | null;
  group_id: number | null;
  section_id: number | null;
}

export interface SetRow {
  id: number;
  session_exercise_id: number;
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  set_type: SetType;
  notes: string | null;
  logged_at: Date;
}

export interface SessionExerciseGroupRow {
  id: number;
  session_id: number;
  group_type: GroupType;
  label: string | null;
  notes: string | null;
  rest_seconds: number | null;
  sort_order: number;
}

export interface SessionSectionRow {
  id: number;
  session_id: number;
  label: string;
  notes: string | null;
  sort_order: number;
}

// ─── Personal Records ──────────────────────────────────────────────────────

export interface PersonalRecordRow {
  user_id: number;
  exercise_id: number;
  record_type: string;
  value: number;
  achieved_at: Date;
  set_id: number | null;
}

export interface PRHistoryRow {
  id: number;
  user_id: number;
  exercise_id: number;
  record_type: string;
  value: number;
  achieved_at: Date;
  set_id: number | null;
}

// ─── Body Measurements ─────────────────────────────────────────────────────

export type MeasurementType =
  | "weight_kg"
  | "body_fat_pct"
  | "chest_cm"
  | "waist_cm"
  | "hips_cm"
  | "bicep_cm"
  | "thigh_cm"
  | "calf_cm";

export interface BodyMeasurementRow {
  id: number;
  user_id: number;
  measurement_type: MeasurementType;
  value: number;
  measured_at: Date;
  notes: string | null;
}

// ─── Auth Tables ───────────────────────────────────────────────────────────

export interface AuthTokenRow {
  token: string;
  workos_user_id: string;
  email: string;
  expires_at: Date;
}

export interface AuthCodeRow {
  code: string;
  workos_user_id: string;
  email: string;
  expires_at: Date;
  code_challenge: string;
  code_challenge_method: string;
}

export interface DynamicClientRow {
  client_id: string;
  redirect_uris: string[];
}

// ─── Query Result Types ────────────────────────────────────────────────────

/** Program with version info (common query pattern) */
export interface ActiveProgramInfo {
  id: number;
  name: string;
  description: string | null;
  version_id: number;
  version_number: number;
  is_active: boolean;
}

/** Day exercise with joined exercise info */
export interface DayExerciseWithInfo extends ProgramDayExerciseRow {
  exercise_name: string;
  exercise_type: ExerciseType;
}

/** Session with exercise details for history */
export interface SessionWithExercises extends SessionRow {
  exercises: Array<{
    name: string;
    sets: SetRow[];
  }>;
}

/** PR check result */
export interface PRCheck {
  record_type: string;
  value: number;
  previous?: number;
}

/** Override for program day exercises */
export interface ExerciseOverride {
  exercise: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
}

/** Single edit operation params */
export interface EditParams {
  userId: number;
  exercise: string;
  workout?: string;
  action: string;
  updates?: {
    reps?: number;
    weight?: number;
    rpe?: number;
    set_type?: string;
    notes?: string;
  };
  set_numbers?: number[];
  set_ids?: number[];
  set_type_filter?: string;
  userDate: string;
  locale?: "en" | "es";
}
