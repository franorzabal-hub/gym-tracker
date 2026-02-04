import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/connection.js", () => {
  const mockQuery = vi.fn();
  return {
    default: {
      query: mockQuery,
      connect: vi.fn(),
    },
  };
});

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import pool from "../../db/connection.js";
import { resolveExercise, searchExercises } from "../exercise-resolver.js";

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe("resolveExercise", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("resolves by exact name match", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Bench Press", names: { en: "Bench Press", es: "Press de Banca" }, muscle_group: "chest", equipment: "barbell", rep_type: "reps", exercise_type: "strength", user_id: null }],
    });

    const result = await resolveExercise("Bench Press");

    expect(result).toEqual({ id: 1, name: "Bench Press", displayName: "Bench Press", isNew: false, exerciseType: "strength" });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE LOWER(name) = $1 AND (user_id IS NULL OR user_id = $2)"),
      ["bench press", 1]
    );
  });

  it("resolves by alias when exact name fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact name miss
      .mockResolvedValueOnce({
        rows: [{ id: 2, name: "Bench Press", names: { en: "Bench Press", es: "Press de Banca" }, muscle_group: "chest", equipment: "barbell", rep_type: "reps", exercise_type: "strength", user_id: null }],
      }); // alias match

    const result = await resolveExercise("press banca");

    expect(result).toEqual({ id: 2, name: "Bench Press", displayName: "Bench Press", isNew: false, exerciseType: "strength" });
  });

  it("resolves by partial match (ILIKE)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact miss
      .mockResolvedValueOnce({ rows: [] }) // alias miss
      .mockResolvedValueOnce({
        rows: [{ id: 3, name: "Incline Bench Press", names: null, muscle_group: "chest", equipment: "barbell", rep_type: "reps", exercise_type: "strength", user_id: null }],
      }); // partial match

    const result = await resolveExercise("incline bench");

    expect(result).toEqual({ id: 3, name: "Incline Bench Press", displayName: "Incline Bench Press", isNew: false, exerciseType: "strength" });
  });

  it("auto-creates exercise when no match found", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact miss
      .mockResolvedValueOnce({ rows: [] }) // alias miss
      .mockResolvedValueOnce({ rows: [] }) // partial miss
      .mockResolvedValueOnce({
        rows: [{ id: 99, name: "Dragon Flag", exercise_type: "strength" }],
      }); // INSERT

    const result = await resolveExercise("Dragon Flag");

    expect(result).toEqual({ id: 99, name: "Dragon Flag", displayName: "Dragon Flag", isNew: true, exerciseType: "strength" });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO exercises"),
      ["Dragon Flag", null, null, "reps", "strength", 1]
    );
  });

  it("passes muscle_group and equipment when auto-creating", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 100, name: "Cable Fly", exercise_type: "strength" }],
      });

    await resolveExercise("Cable Fly", "chest", "cable");

    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO exercises"),
      ["Cable Fly", "chest", "cable", "reps", "strength", 1]
    );
  });

  it("trims and lowercases input for matching", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Squat", names: { en: "Squat", es: "Sentadilla" }, muscle_group: "legs", equipment: "barbell", rep_type: "reps", exercise_type: "strength", user_id: null }],
    });

    await resolveExercise("  Squat  ");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["squat", 1]
    );
  });

  it("returns localized displayName for Spanish locale", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Squat", names: { en: "Squat", es: "Sentadilla" }, muscle_group: "legs", equipment: "barbell", rep_type: "reps", exercise_type: "strength", user_id: null }],
    });

    const result = await resolveExercise("Squat", undefined, undefined, undefined, undefined, undefined, "es");

    expect(result).toEqual({ id: 1, name: "Squat", displayName: "Sentadilla", isNew: false, exerciseType: "strength" });
  });
});

describe("searchExercises", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns all exercises when no filters", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Squat", names: { en: "Squat", es: "Sentadilla" }, muscle_group: "legs", equipment: "barbell", aliases: ["sentadilla"] },
      ],
    });

    const result = await searchExercises();

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Squat");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("(e.user_id IS NULL OR e.user_id = $1)"),
      [1]
    );
  });

  it("returns localized displayName for Spanish locale", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Squat", names: { en: "Squat", es: "Sentadilla" }, muscle_group: "legs", equipment: "barbell", aliases: [] },
      ],
    });

    const result = await searchExercises(undefined, undefined, "es");

    expect(result[0].displayName).toBe("Sentadilla");
  });

  it("filters by query string", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises("bench");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      [1, "%bench%"]
    );
  });

  it("filters by muscle group", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises(undefined, "chest");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("LOWER(e.muscle_group)"),
      [1, "chest"]
    );
  });

  it("combines query and muscle_group filters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises("press", "chest");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("AND"),
      [1, "%press%", "chest"]
    );
  });
});
