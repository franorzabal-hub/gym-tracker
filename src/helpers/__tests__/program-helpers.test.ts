import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockClientQuery, mockClient } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClient = { query: mockClientQuery, release: vi.fn() };
  return {
    mockQuery: vi.fn(),
    mockClientQuery,
    mockClient,
  };
});

vi.mock("../../db/connection.js", () => ({
  default: {
    query: mockQuery,
    connect: vi.fn().mockResolvedValue(mockClient),
  },
}));

import {
  getActiveProgram,
  getLatestVersion,
  getProgramDaysWithExercises,
  inferTodayDay,
  cloneVersion,
} from "../program-helpers.js";

describe("getActiveProgram", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns active program with latest version", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "PPL", description: "Push Pull Legs", version_id: 5, version_number: 3 }],
    });

    const result = await getActiveProgram();
    expect(result).toEqual({
      id: 1, name: "PPL", description: "Push Pull Legs", version_id: 5, version_number: 3,
    });
  });

  it("returns null when no active program", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getActiveProgram();
    expect(result).toBeNull();
  });
});

describe("getLatestVersion", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns latest version for a program", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 10, version_number: 3 }] });
    const result = await getLatestVersion(1);
    expect(result).toEqual({ id: 10, version_number: 3 });
  });

  it("returns null when no versions exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getLatestVersion(999);
    expect(result).toBeNull();
  });
});

describe("getProgramDaysWithExercises", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns days with their exercises", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1, day_label: "Push", weekdays: [1, 4], sort_order: 0,
          exercises: [{ id: 10, exercise_name: "Bench Press", exercise_id: 1, target_sets: 4, target_reps: 8, target_weight: null, target_rpe: null, sort_order: 0, superset_group: null, notes: null }],
        },
        {
          id: 2, day_label: "Pull", weekdays: [2, 5], sort_order: 1,
          exercises: [{ id: 20, exercise_name: "Barbell Row", exercise_id: 5, target_sets: 4, target_reps: 8, target_weight: null, target_rpe: null, sort_order: 0, superset_group: null, notes: null }],
        },
      ],
    });

    const result = await getProgramDaysWithExercises(1);
    expect(result).toHaveLength(2);
    expect(result[0].day_label).toBe("Push");
    expect(result[0].exercises).toHaveLength(1);
  });

  it("returns empty array when no days", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getProgramDaysWithExercises(999);
    expect(result).toEqual([]);
  });
});

describe("inferTodayDay", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns null when no version exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await inferTodayDay(999);
    expect(result).toBeNull();
  });

  it("queries with correct ISO weekday", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 10, version_number: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await inferTodayDay(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("cloneVersion", () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
    mockClient.release.mockReset();
  });

  it("creates a new version with incremented number", async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ version_number: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 50 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 10, day_label: "Push", weekdays: [1], sort_order: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 20 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await cloneVersion(1, 5, "Added lateral raises");
    expect(result).toEqual({ newVersionId: 50, versionNumber: 3 });
    expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("rolls back on error", async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("DB error"));

    await expect(cloneVersion(1, 5, "test")).rejects.toThrow("DB error");
    expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});
