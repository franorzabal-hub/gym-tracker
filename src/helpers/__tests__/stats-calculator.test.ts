import { describe, it, expect, vi, beforeEach } from "vitest";
import { estimateE1RM, calculateVolume, checkPRs } from "../stats-calculator.js";

// Mock the DB pool
vi.mock("../../db/connection.js", () => {
  const mockQuery = vi.fn();
  const mockClient = {
    query: mockQuery,
    release: vi.fn(),
  };
  return {
    default: {
      query: mockQuery,
      connect: vi.fn().mockResolvedValue(mockClient),
    },
  };
});

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import pool from "../../db/connection.js";
const mockQuery = pool.query as ReturnType<typeof vi.fn>;

describe("estimateE1RM", () => {
  it("returns same weight for 1 rep", () => {
    expect(estimateE1RM(100, 1)).toBe(100);
  });

  it("calculates Epley formula correctly for 5 reps", () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 = 116.67 → rounded to 116.7
    expect(estimateE1RM(100, 5)).toBe(116.7);
  });

  it("calculates correctly for 10 reps", () => {
    // 80 * (1 + 10/30) = 80 * 1.333 = 106.67 → 106.7
    expect(estimateE1RM(80, 10)).toBe(106.7);
  });

  it("handles high reps", () => {
    // 50 * (1 + 20/30) = 50 * 1.667 = 83.3
    expect(estimateE1RM(50, 20)).toBe(83.3);
  });

  it("handles decimal weight", () => {
    const result = estimateE1RM(62.5, 8);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(62.5);
  });
});

describe("calculateVolume", () => {
  it("calculates total volume from working sets", () => {
    const sets = [
      { weight: 100, reps: 5, set_type: "working" },
      { weight: 100, reps: 5, set_type: "working" },
      { weight: 100, reps: 5, set_type: "working" },
    ];
    expect(calculateVolume(sets)).toBe(1500);
  });

  it("excludes warmup sets", () => {
    const sets = [
      { weight: 60, reps: 10, set_type: "warmup" },
      { weight: 100, reps: 5, set_type: "working" },
      { weight: 100, reps: 5, set_type: "working" },
    ];
    expect(calculateVolume(sets)).toBe(1000);
  });

  it("handles null weight (bodyweight exercises)", () => {
    const sets = [
      { weight: null, reps: 10, set_type: "working" },
      { weight: null, reps: 8, set_type: "working" },
    ];
    expect(calculateVolume(sets)).toBe(0);
  });

  it("handles mixed sets", () => {
    const sets = [
      { weight: 80, reps: 8, set_type: "working" },
      { weight: 70, reps: 10, set_type: "drop" },
      { weight: 60, reps: 5, set_type: "failure" },
    ];
    // All non-warmup: 640 + 700 + 300 = 1640
    expect(calculateVolume(sets)).toBe(1640);
  });

  it("returns 0 for empty sets", () => {
    expect(calculateVolume([])).toBe(0);
  });

  it("handles undefined weight", () => {
    const sets = [{ reps: 10, set_type: "working" }];
    expect(calculateVolume(sets)).toBe(0);
  });
});

describe("checkPRs", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("detects new max weight PR", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ record_type: "max_weight", value: 90 }, { record_type: "estimated_1rm", value: 100 }] }) // bulk load PRs
      .mockResolvedValueOnce({ rows: [] }) // upsert max_weight
      .mockResolvedValueOnce({ rows: [] }) // pr_history max_weight
      .mockResolvedValueOnce({ rows: [] }) // upsert max_reps
      .mockResolvedValueOnce({ rows: [] }) // pr_history max_reps
      .mockResolvedValueOnce({ rows: [] }) // upsert e1rm
      .mockResolvedValueOnce({ rows: [] }) // pr_history e1rm
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const prs = await checkPRs(1, [
      { reps: 5, weight: 100, set_id: 42 },
    ]);

    expect(prs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ record_type: "max_weight", value: 100, previous: 90 }),
      ])
    );
  });

  it("detects new estimated 1RM PR", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ record_type: "max_weight", value: 120 }, { record_type: "estimated_1rm", value: 100 }] }) // bulk load PRs
      .mockResolvedValueOnce({ rows: [] }) // upsert max_reps
      .mockResolvedValueOnce({ rows: [] }) // pr_history max_reps
      .mockResolvedValueOnce({ rows: [] }) // upsert e1rm
      .mockResolvedValueOnce({ rows: [] }) // pr_history e1rm
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const prs = await checkPRs(1, [
      { reps: 8, weight: 100, set_id: 42 },
    ]);

    expect(prs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ record_type: "estimated_1rm" }),
      ])
    );
    const e1rmPr = prs.find((p) => p.record_type === "estimated_1rm");
    expect(e1rmPr!.value).toBeGreaterThan(100);
  });

  it("skips sets with no weight", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // bulk load PRs (empty)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const prs = await checkPRs(1, [
      { reps: 10, weight: null, set_id: 42 },
    ]);

    expect(prs).toEqual([]);
  });

  it("skips sets with zero weight", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // bulk load PRs (empty)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const prs = await checkPRs(1, [
      { reps: 10, weight: 0, set_id: 42 },
    ]);

    expect(prs).toEqual([]);
  });

  it("deduplicates PRs by record type (keeps best)", async () => {
    // Two sets, both beat max_weight
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ record_type: "max_weight", value: 80 }, { record_type: "estimated_1rm", value: 90 }] }) // bulk load PRs
      .mockResolvedValueOnce({ rows: [] }) // upsert max_weight (100)
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }) // upsert max_reps_at_100
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }) // upsert e1rm
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }) // upsert max_weight (110)
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }) // upsert max_reps_at_110
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }) // upsert e1rm
      .mockResolvedValueOnce({ rows: [] }) // pr_history
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const prs = await checkPRs(1, [
      { reps: 5, weight: 100, set_id: 1 },
      { reps: 5, weight: 110, set_id: 2 },
    ]);

    const maxWeightPrs = prs.filter((p) => p.record_type === "max_weight");
    expect(maxWeightPrs).toHaveLength(1);
    expect(maxWeightPrs[0].value).toBe(110);
  });
});
