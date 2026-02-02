import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockClientQuery, mockClient } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClient = { query: mockClientQuery, release: vi.fn() };
  return { mockClientQuery, mockClient };
});

vi.mock("../../db/connection.js", () => ({
  default: {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
  },
}));

import { insertGroup, cloneGroups } from "../group-helpers.js";

describe("insertGroup", () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
  });

  it("inserts a group and returns the new id", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });

    const id = await insertGroup(
      "program_exercise_groups",
      "day_id",
      10,
      { group_type: "superset", label: "Chest + Shoulders", notes: null, rest_seconds: 90 },
      0,
      mockClient as any
    );

    expect(id).toBe(42);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockClientQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO program_exercise_groups");
    expect(params).toEqual([10, "superset", "Chest + Shoulders", null, 90, 0]);
  });

  it("works with all group types", async () => {
    for (const type of ["superset", "paired", "circuit"] as const) {
      mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      await insertGroup("session_exercise_groups", "session_id", 5, { group_type: type, label: null, notes: null, rest_seconds: null }, 0, mockClient as any);
    }
    expect(mockClientQuery).toHaveBeenCalledTimes(3);
  });
});

describe("cloneGroups", () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
  });

  it("returns empty map when source has no groups", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const map = await cloneGroups(
      "program_exercise_groups", "session_exercise_groups",
      "day_id", "session_id",
      10, 20,
      mockClient as any
    );

    expect(map.size).toBe(0);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
  });

  it("clones groups and returns old→new id mapping", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 100, group_type: "superset", label: "SS1", notes: null, rest_seconds: 60, sort_order: 0 },
          { id: 101, group_type: "circuit", label: "Circuit", notes: "Go fast", rest_seconds: 120, sort_order: 1 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // insert group 100 → 200
      .mockResolvedValueOnce({ rows: [{ id: 201 }] }); // insert group 101 → 201

    const map = await cloneGroups(
      "program_exercise_groups", "session_exercise_groups",
      "day_id", "session_id",
      10, 20,
      mockClient as any
    );

    expect(map.size).toBe(2);
    expect(map.get(100)).toBe(200);
    expect(map.get(101)).toBe(201);
    expect(mockClientQuery).toHaveBeenCalledTimes(3);
  });
});
