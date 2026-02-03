import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery },
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { profileSchema, getProfile, isProfileComplete, normalizeProfileData, MAX_PROFILE_SIZE_BYTES } from "../profile-helpers.js";

describe("profile-helpers", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("profileSchema", () => {
    it("validates correct profile data", () => {
      const result = profileSchema.safeParse({
        name: "Franco",
        age: 30,
        weight_kg: 80,
        experience_level: "intermediate",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid age", () => {
      const result = profileSchema.safeParse({ age: 5 });
      expect(result.success).toBe(false);
    });

    it("accepts minimum valid age (13)", () => {
      const result = profileSchema.safeParse({ age: 13 });
      expect(result.success).toBe(true);
    });

    it("accepts maximum valid age (120)", () => {
      const result = profileSchema.safeParse({ age: 120 });
      expect(result.success).toBe(true);
    });

    it("rejects age over 120", () => {
      const result = profileSchema.safeParse({ age: 121 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid experience_level", () => {
      const result = profileSchema.safeParse({ experience_level: "pro" });
      expect(result.success).toBe(false);
    });

    it("accepts all valid experience levels", () => {
      for (const level of ["beginner", "intermediate", "advanced"]) {
        const result = profileSchema.safeParse({ experience_level: level });
        expect(result.success).toBe(true);
      }
    });

    it("rejects weight over 500kg", () => {
      const result = profileSchema.safeParse({ weight_kg: 501 });
      expect(result.success).toBe(false);
    });

    it("accepts maximum valid weight (500kg)", () => {
      const result = profileSchema.safeParse({ weight_kg: 500 });
      expect(result.success).toBe(true);
    });

    it("rejects height over 300cm", () => {
      const result = profileSchema.safeParse({ height_cm: 301 });
      expect(result.success).toBe(false);
    });

    it("accepts valid sex values", () => {
      expect(profileSchema.safeParse({ sex: "male" }).success).toBe(true);
      expect(profileSchema.safeParse({ sex: "female" }).success).toBe(true);
    });

    it("rejects invalid sex values", () => {
      expect(profileSchema.safeParse({ sex: "other" }).success).toBe(false);
    });

    it("allows extra fields with passthrough", () => {
      const result = profileSchema.safeParse({ custom_field: "value" });
      expect(result.success).toBe(true);
      expect(result.data?.custom_field).toBe("value");
    });

    it("validates goals array with max 10 items", () => {
      const result = profileSchema.safeParse({ goals: Array(11).fill("goal") });
      expect(result.success).toBe(false);
    });

    it("validates injuries array with max 20 items", () => {
      const result = profileSchema.safeParse({ injuries: Array(21).fill("injury") });
      expect(result.success).toBe(false);
    });
  });

  describe("getProfile", () => {
    it("returns profile data when exists", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ data: { name: "Franco" } }],
      });
      const profile = await getProfile();
      expect(profile).toEqual({ name: "Franco" });
    });

    it("returns empty object when no profile", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const profile = await getProfile();
      expect(profile).toEqual({});
    });
  });

  describe("isProfileComplete", () => {
    it("returns true when required fields present", () => {
      expect(isProfileComplete({ name: "Franco", experience_level: "beginner" })).toBe(true);
    });

    it("returns false when name missing", () => {
      expect(isProfileComplete({ experience_level: "beginner" })).toBe(false);
    });

    it("returns false when experience_level missing", () => {
      expect(isProfileComplete({ name: "Franco" })).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isProfileComplete({})).toBe(false);
    });
  });

  describe("normalizeProfileData", () => {
    it("trims string values", () => {
      const result = normalizeProfileData({ name: "  Franco  ", gym: "  SmartFit  " });
      expect(result.name).toBe("Franco");
      expect(result.gym).toBe("SmartFit");
    });

    it("filters empty injuries", () => {
      const result = normalizeProfileData({ injuries: ["shoulder", "", "  "] });
      expect(result.injuries).toEqual(["shoulder"]);
    });

    it("filters none-pattern injuries", () => {
      const result = normalizeProfileData({ injuries: ["shoulder", "nada", "none", "n/a", "ninguna"] });
      expect(result.injuries).toEqual(["shoulder"]);
    });

    it("filters all NONE_PATTERNS variations", () => {
      // Patterns matching the regex: /^nada$/i, /^ninguna?$/i, /^none$/i, /^n\/a$/i,
      // /^na$/i, /^no$/i, /^no tengo$/i, /^sin lesiones?$/i, /^nothing$/i, /^-$/
      const nonePatterns = [
        "nada", "NADA",
        "ninguna", "ningun", "NINGUNA",  // ninguna? matches ninguna or ningun
        "none", "NONE",
        "n/a", "N/A",
        "na", "NA",
        "no", "NO",
        "no tengo", "No Tengo",
        "sin lesiones", "sin lesione",  // sin lesiones? matches with/without final 's'
        "nothing", "NOTHING",
        "-",
      ];
      const result = normalizeProfileData({ injuries: [...nonePatterns, "real injury"] });
      expect(result.injuries).toEqual(["real injury"]);
    });

    it("preserves valid injuries that look similar to none patterns", () => {
      const result = normalizeProfileData({ injuries: ["nada-shoulder", "no-lift", "knee-na"] });
      expect(result.injuries).toEqual(["nada-shoulder", "no-lift", "knee-na"]);
    });

    it("preserves non-string values", () => {
      const result = normalizeProfileData({ age: 30, weight_kg: 80.5 });
      expect(result.age).toBe(30);
      expect(result.weight_kg).toBe(80.5);
    });

    it("handles array fields other than injuries without filtering", () => {
      const result = normalizeProfileData({ goals: ["strength", "none", "hypertrophy"] });
      expect(result.goals).toEqual(["strength", "none", "hypertrophy"]);
    });

    it("handles empty object", () => {
      const result = normalizeProfileData({});
      expect(result).toEqual({});
    });

    it("handles null values", () => {
      const result = normalizeProfileData({ name: null, age: 30 });
      expect(result.name).toBeNull();
      expect(result.age).toBe(30);
    });
  });

  describe("MAX_PROFILE_SIZE_BYTES", () => {
    it("is 64KB", () => {
      expect(MAX_PROFILE_SIZE_BYTES).toBe(65536);
    });
  });
});
