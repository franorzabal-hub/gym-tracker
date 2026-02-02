import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClientQuery = vi.fn();
const mockClient = { query: mockClientQuery, release: vi.fn() } as any;

import { insertSection, cloneSections } from "../section-helpers.js";

describe("insertSection", () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
  });

  it("inserts a section and returns its id", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] });

    const id = await insertSection(
      "program_sections", "day_id", 10,
      { label: "Warm-up", notes: "Light work" },
      0, mockClient
    );

    expect(id).toBe(42);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO program_sections"),
      [10, "Warm-up", "Light work", 0]
    );
  });

  it("handles null notes", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await insertSection(
      "session_sections", "session_id", 5,
      { label: "Main work" },
      1, mockClient
    );

    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO session_sections"),
      [5, "Main work", null, 1]
    );
  });
});

describe("cloneSections", () => {
  beforeEach(() => {
    mockClientQuery.mockReset();
  });

  it("clones sections and returns id mapping", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, label: "Warm-up", notes: null, sort_order: 0 },
          { id: 2, label: "Main", notes: "Heavy", sort_order: 1 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 11 }] });

    const map = await cloneSections(
      "program_sections", "session_sections",
      "day_id", "session_id",
      100, 200,
      mockClient
    );

    expect(map.size).toBe(2);
    expect(map.get(1)).toBe(10);
    expect(map.get(2)).toBe(11);
  });

  it("returns empty map when no sections exist", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const map = await cloneSections(
      "program_sections", "program_sections",
      "day_id", "day_id",
      1, 2,
      mockClient
    );

    expect(map.size).toBe(0);
  });
});
