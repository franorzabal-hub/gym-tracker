import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  findExercise: vi.fn().mockResolvedValue({ id: 1, name: "Bench Press", isNew: false }),
}));

vi.mock("../../helpers/stats-calculator.js", () => ({
  estimateE1RM: vi.fn((w: number, r: number) => {
    if (r === 1) return w;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  }),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/date-helpers.js", () => ({
  getUserCurrentDate: vi.fn().mockResolvedValue("2024-01-15"),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatsTool } from "../stats.js";
import { findExercise } from "../../helpers/exercise-resolver.js";

const mockFindExercise = findExercise as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("get_stats tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockFindExercise.mockReset();
    mockFindExercise.mockResolvedValue({ id: 1, name: "Bench Press", isNew: false });

    const server = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerStatsTool(server);
  });

  it("returns comprehensive stats", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { record_type: "max_weight", value: 100, achieved_at: "2024-01-10" },
          { record_type: "estimated_1rm", value: 116.7, achieved_at: "2024-01-10" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { date: "2024-01-01", max_weight: 80, reps_at_max: 8 },
          { date: "2024-01-08", max_weight: 85, reps_at_max: 8 },
          { date: "2024-01-15", max_weight: 90, reps_at_max: 6 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { week: "2024-01-01", total_volume_kg: "3200" },
          { week: "2024-01-08", total_volume_kg: "3600" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ total_sessions: "6", span_days: "30" }],
      })
      .mockResolvedValueOnce({ rows: [] }); // pr_timeline

    const result = await toolHandler({ exercise: "Bench Press", period: "3months" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exercise).toBe("Bench Press");
    expect(parsed.personal_records.max_weight.value).toBe(100);
    expect(parsed.progression).toHaveLength(3);
    expect(parsed.volume_trend).toHaveLength(2);
    expect(parsed.volume_trend[0].total_volume_kg).toBe(3200);
    expect(parsed.frequency.total_sessions).toBe(6);
    expect(parsed.frequency.sessions_per_week).toBeCloseTo(1.4, 1);
  });

  it("uses correct date filters for month period", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_sessions: "0", span_days: null }] })
      .mockResolvedValueOnce({ rows: [] }); // pr_timeline

    await toolHandler({ exercise: "Bench Press", period: "month" });

    const progressionCall = mockQuery.mock.calls[1];
    expect(progressionCall[0]).toContain("30 days");
  });

  it("uses no date filter for 'all' period", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_sessions: "0", span_days: null }] })
      .mockResolvedValueOnce({ rows: [] }); // pr_timeline

    await toolHandler({ exercise: "Bench Press", period: "all" });

    const progressionCall = mockQuery.mock.calls[1];
    expect(progressionCall[0]).not.toContain("INTERVAL");
  });

  it("handles zero span days gracefully", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_sessions: "2", span_days: 0 }] })
      .mockResolvedValueOnce({ rows: [] }); // pr_timeline

    const result = await toolHandler({ exercise: "Bench Press", period: "3months" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.frequency.sessions_per_week).toBe(2);
  });

  it("calculates estimated 1RM for progression entries", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ date: "2024-01-01", max_weight: 100, reps_at_max: 5 }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_sessions: "1", span_days: 7 }] })
      .mockResolvedValueOnce({ rows: [] }); // pr_timeline

    const result = await toolHandler({ exercise: "Bench Press", period: "3months" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.progression[0].estimated_1rm).toBe(116.7);
  });

  it("returns error when no exercise or exercises provided", async () => {
    const result = await toolHandler({ period: "3months" });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("Provide");
  });

  describe("multi-exercise mode", () => {
    it("returns stats for multiple exercises", async () => {
      mockFindExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press" })
        .mockResolvedValueOnce({ id: 2, name: "Squat" });

      // Stats queries for Bench Press (5 queries)
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: "3", span_days: 21 }] })
        .mockResolvedValueOnce({ rows: [] });

      // Stats queries for Squat (5 queries)
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: "2", span_days: 14 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        exercises: ["Bench Press", "Squat"],
        period: "3months",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toHaveLength(2);
      expect(parsed.stats[0].exercise).toBe("Bench Press");
      expect(parsed.stats[1].exercise).toBe("Squat");
    });

    it("handles not-found exercises in multi mode", async () => {
      mockFindExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press" })
        .mockResolvedValueOnce(null);

      // Stats queries for Bench Press
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: "0", span_days: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        exercises: ["Bench Press", "NonExistent"],
        period: "3months",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toHaveLength(2);
      expect(parsed.stats[0].exercise).toBe("Bench Press");
      expect(parsed.stats[1].error).toContain("not found");
    });

    it("handles JSON string workaround for exercises", async () => {
      mockFindExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press" })
        .mockResolvedValueOnce({ id: 2, name: "Squat" });

      // Stats queries for Bench Press
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: "0", span_days: null }] })
        .mockResolvedValueOnce({ rows: [] });
      // Stats queries for Squat
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_sessions: "0", span_days: null }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        exercises: JSON.stringify(["Bench Press", "Squat"]),
        period: "3months",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.stats).toHaveLength(2);
    });
  });
});
