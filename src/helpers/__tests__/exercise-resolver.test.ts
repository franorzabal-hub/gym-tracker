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

import pool from "../../db/connection.js";
import { resolveExercise, searchExercises } from "../exercise-resolver.js";

const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe("resolveExercise", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("resolves by exact name match", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Bench Press", muscle_group: "chest", equipment: "barbell" }],
    });

    const result = await resolveExercise("Bench Press");

    expect(result).toEqual({ id: 1, name: "Bench Press", isNew: false });
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT id, name, muscle_group, equipment FROM exercises WHERE LOWER(name) = $1",
      ["bench press"]
    );
  });

  it("resolves by alias when exact name fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact name miss
      .mockResolvedValueOnce({
        rows: [{ id: 2, name: "Bench Press" }],
      }); // alias match

    const result = await resolveExercise("press banca");

    expect(result).toEqual({ id: 2, name: "Bench Press", isNew: false });
  });

  it("resolves by partial match (ILIKE)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact miss
      .mockResolvedValueOnce({ rows: [] }) // alias miss
      .mockResolvedValueOnce({
        rows: [{ id: 3, name: "Incline Bench Press" }],
      }); // partial match

    const result = await resolveExercise("incline bench");

    expect(result).toEqual({ id: 3, name: "Incline Bench Press", isNew: false });
  });

  it("auto-creates exercise when no match found", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // exact miss
      .mockResolvedValueOnce({ rows: [] }) // alias miss
      .mockResolvedValueOnce({ rows: [] }) // partial miss
      .mockResolvedValueOnce({
        rows: [{ id: 99, name: "Dragon Flag" }],
      }); // INSERT

    const result = await resolveExercise("Dragon Flag");

    expect(result).toEqual({ id: 99, name: "Dragon Flag", isNew: true });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO exercises"),
      ["Dragon Flag", null, null]
    );
  });

  it("passes muscle_group and equipment when auto-creating", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 100, name: "Cable Fly" }],
      });

    await resolveExercise("Cable Fly", "chest", "cable");

    expect(mockQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO exercises"),
      ["Cable Fly", "chest", "cable"]
    );
  });

  it("trims and lowercases input for matching", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Squat" }],
    });

    await resolveExercise("  Squat  ");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["squat"]
    );
  });
});

describe("searchExercises", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns all exercises when no filters", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "Squat", muscle_group: "legs", equipment: "barbell", aliases: ["sentadilla"] },
      ],
    });

    const result = await searchExercises();

    expect(result).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY e.id"),
      []
    );
  });

  it("filters by query string", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises("bench");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      ["%bench%"]
    );
  });

  it("filters by muscle group", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises(undefined, "chest");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("LOWER(e.muscle_group)"),
      ["chest"]
    );
  });

  it("combines query and muscle_group filters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await searchExercises("press", "chest");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("AND"),
      ["%press%", "chest"]
    );
  });
});
