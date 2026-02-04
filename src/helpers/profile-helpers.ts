import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";

/** Maximum size of the profile JSONB in bytes */
export const MAX_PROFILE_SIZE_BYTES = 65536;

/** Fields required for a profile to be considered complete */
const REQUIRED_FOR_COMPLETE = ["name", "experience_level"] as const;

/** Common patterns that indicate "no injuries" in various languages */
const NONE_PATTERNS = [
  /^nada$/i,
  /^ninguna?$/i,
  /^none$/i,
  /^n\/a$/i,
  /^na$/i,
  /^no$/i,
  /^no tengo$/i,
  /^sin lesiones?$/i,
  /^nothing$/i,
  /^-$/,
];

/**
 * Zod schema for validating profile data.
 * Uses .passthrough() to allow extra fields beyond the standard ones.
 */
export const profileSchema = z
  .object({
    name: z.string().max(100).optional(),
    age: z.number().int().min(13).max(120).optional(),
    sex: z.enum(["male", "female"]).optional(),
    weight_kg: z.number().positive().max(500).optional(),
    height_cm: z.number().positive().max(300).optional(),
    goals: z
      .array(z.string().max(50))
      .max(10)
      .optional(),
    experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    training_days_per_week: z.number().int().min(1).max(7).optional(),
    available_days: z.array(z.string()).max(7).optional(),
    injuries: z
      .array(z.string().max(100))
      .max(20)
      .optional(),
    preferred_units: z.enum(["kg", "lb"]).optional(),
    gym: z.string().max(100).optional(),
    supplements: z.string().max(500).optional(),
    requires_validation: z.boolean().optional(),
    timezone: z.string().optional(),
    language: z.enum(["en", "es"]).optional(),
  })
  .passthrough();

export type ProfileData = z.infer<typeof profileSchema>;

/**
 * Retrieves the profile data for a user.
 * @param userId - Optional user ID. If not provided, uses getUserId() from context.
 * @returns The profile data object, or empty object if no profile exists.
 */
export async function getProfile(userId?: number): Promise<Record<string, unknown>> {
  const uid = userId ?? getUserId();
  const { rows } = await pool.query(
    "SELECT data FROM user_profile WHERE user_id = $1 LIMIT 1",
    [uid]
  );
  return rows[0]?.data || {};
}

/**
 * Checks if a profile has all required fields for completeness.
 * @param data - The profile data to check.
 * @returns True if all required fields are present and non-null.
 */
export function isProfileComplete(data: Record<string, unknown>): boolean {
  return REQUIRED_FOR_COMPLETE.every(
    (field) => data[field] != null && data[field] !== ""
  );
}

/**
 * Normalizes profile data by trimming strings and filtering out
 * empty or "none" injury entries.
 * @param data - The profile data to normalize.
 * @returns A new object with normalized values.
 */
export function normalizeProfileData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      normalized[key] = value.trim();
    } else if (key === "injuries" && Array.isArray(value)) {
      // Filter out empty strings and "none" patterns
      normalized[key] = value
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => {
          if (typeof v !== "string" || v === "") return false;
          return !NONE_PATTERNS.some((pattern) => pattern.test(v));
        });
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

/** Supported locales */
export type Locale = "en" | "es";

/** Default locale when user hasn't set one */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Gets the user's preferred locale from their profile.
 * Falls back to DEFAULT_LOCALE if not set.
 */
export async function getUserLocale(userId?: number): Promise<Locale> {
  const profile = await getProfile(userId);
  const lang = profile.language as string | undefined;
  if (lang === "en" || lang === "es") return lang;
  return DEFAULT_LOCALE;
}

/**
 * Extracts a localized string from a JSONB names object.
 * Falls back: locale → 'en' → fallback
 *
 * @param names - JSONB object like {"en": "Squat", "es": "Sentadilla"}
 * @param locale - User's preferred locale
 * @param fallback - Fallback string if no translation found
 */
export function getLocalizedName(
  names: Record<string, string> | null | undefined,
  locale: Locale,
  fallback: string
): string {
  if (!names) return fallback;
  return names[locale] ?? names["en"] ?? fallback;
}
