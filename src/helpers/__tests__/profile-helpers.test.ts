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

    it("rejects invalid experience_level", () => {
      const result = profileSchema.safeParse({ experience_level: "pro" });
      expect(result.success).toBe(false);
    });

    it("allows extra fields with passthrough", () => {
      const result = profileSchema.safeParse({ custom_field: "value" });
      expect(result.success).toBe(true);
      expect(result.data?.custom_field).toBe("value");
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

    it("preserves non-string values", () => {
      const result = normalizeProfileData({ age: 30, weight_kg: 80.5 });
      expect(result.age).toBe(30);
      expect(result.weight_kg).toBe(80.5);
    });
  });

  describe("MAX_PROFILE_SIZE_BYTES", () => {
    it("is 64KB", () => {
      expect(MAX_PROFILE_SIZE_BYTES).toBe(65536);
    });
  });
});
