import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/profile-helpers.js", () => ({
  getProfile: vi.fn().mockResolvedValue({ language: "en" }),
}));

const toolHandlers: Record<string, Function> = {};

vi.mock("../../helpers/tool-response.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../helpers/tool-response.js")>();
  return {
    ...orig,
    registerAppToolWithMeta: vi.fn((_server: any, name: string, _config: any, handler: Function) => {
      toolHandlers[name] = handler;
    }),
  };
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDashboardTool } from "../dashboard.js";
import { registerAppToolWithMeta } from "../../helpers/tool-response.js";

// Helper: create a Date in a week-aligned way for streak tests
function weekDate(weeksAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // this monday
  d.setDate(d.getDate() - weeksAgo * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("show_dashboard tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    const server = {} as unknown as McpServer;
    registerDashboardTool(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerDashboardTool(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_dashboard",
      expect.objectContaining({
        title: "Training Dashboard",
        annotations: { readOnlyHint: true },
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/dashboard.html" } }),
      }),
      expect.any(Function),
    );
  });

  it("returns all metrics when no metric param is given", async () => {
    // Mock all 9 queries in order (7 metrics + 2 pending validation)
    mockQuery
      // streak
      .mockResolvedValueOnce({ rows: [{ week: weekDate(0), cnt: 2 }, { week: weekDate(1), cnt: 3 }] })
      // volume
      .mockResolvedValueOnce({ rows: [{ week: weekDate(1), volume: "5000" }, { week: weekDate(0), volume: "6200" }] })
      // frequency
      .mockResolvedValueOnce({ rows: [{ week: weekDate(1), count: 3 }, { week: weekDate(0), count: 2 }] })
      // prs
      .mockResolvedValueOnce({ rows: [{ exercise: "Bench Press", record_type: "max_weight", value: "100", achieved_at: new Date("2024-06-01") }] })
      // muscle groups
      .mockResolvedValueOnce({ rows: [{ muscle_group: "chest", volume: "3000", sets: 20 }] })
      // body weight
      .mockResolvedValueOnce({ rows: [{ value: "80.5", measured_at: new Date("2024-06-01") }] })
      // top exercises
      .mockResolvedValueOnce({ rows: [{ exercise: "Bench Press", volume: "4000", sessions: 10 }] })
      // pending validation: sessions count
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      // pending validation: programs count
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({});

    expect(result.structuredContent.period).toBe("3months");
    expect(result.structuredContent.metric).toBeUndefined();
    expect(result.structuredContent.streak).toBeDefined();
    expect(result.structuredContent.streak.current_weeks).toBeGreaterThanOrEqual(0);
    expect(result.structuredContent.volume_weekly).toHaveLength(2);
    expect(result.structuredContent.frequency.avg_per_week).toBe(2.5);
    expect(result.structuredContent.frequency.total).toBe(5);
    expect(result.structuredContent.recent_prs).toHaveLength(1);
    expect(result.structuredContent.recent_prs[0].exercise).toBe("Bench Press");
    expect(result.structuredContent.muscle_groups).toHaveLength(1);
    expect(result.structuredContent.body_weight).toHaveLength(1);
    expect(result.structuredContent.top_exercises).toHaveLength(1);
    expect(result.content[0].text).toContain("Do NOT describe");
  });

  it("returns only the specified metric when metric param is given", async () => {
    // Only PRs query should run + pending validation queries
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { exercise: "Squat", record_type: "estimated_1rm", value: "150", achieved_at: new Date("2024-05-15") },
          { exercise: "Deadlift", record_type: "max_weight", value: "180", achieved_at: new Date("2024-05-10") },
        ],
      })
      // pending validation
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({ metric: "prs" });

    expect(result.structuredContent.metric).toBe("prs");
    expect(result.structuredContent.recent_prs).toHaveLength(2);
    // Other metrics should be absent
    expect(result.structuredContent.streak).toBeUndefined();
    expect(result.structuredContent.volume_weekly).toBeUndefined();
    expect(result.structuredContent.frequency).toBeUndefined();
    expect(result.structuredContent.muscle_groups).toBeUndefined();
    expect(result.structuredContent.body_weight).toBeUndefined();
    expect(result.structuredContent.top_exercises).toBeUndefined();
  });

  it("handles empty data for a new user", async () => {
    // All queries return empty + pending validation
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // streak
      .mockResolvedValueOnce({ rows: [] })   // volume
      .mockResolvedValueOnce({ rows: [] })   // frequency
      .mockResolvedValueOnce({ rows: [] })   // prs
      .mockResolvedValueOnce({ rows: [] })   // muscle groups
      .mockResolvedValueOnce({ rows: [] })   // body weight
      .mockResolvedValueOnce({ rows: [] })   // top exercises
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })   // pending sessions
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });  // pending programs

    const result = await toolHandlers["show_dashboard"]({});

    expect(result.structuredContent.period).toBe("3months");
    expect(result.structuredContent.streak).toEqual({
      current_weeks: 0, longest_weeks: 0, this_week: 0, target: 1,
    });
    expect(result.structuredContent.volume_weekly).toEqual([]);
    expect(result.structuredContent.frequency).toEqual({ avg_per_week: 0, total: 0, weekly: [] });
    expect(result.structuredContent.recent_prs).toEqual([]);
    expect(result.structuredContent.muscle_groups).toEqual([]);
    expect(result.structuredContent.body_weight).toBeUndefined(); // null gets filtered
    expect(result.structuredContent.top_exercises).toEqual([]);
  });

  it("respects period parameter", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({ period: "year" });

    expect(result.structuredContent.period).toBe("year");
    // Verify the days param was used in queries (365 for "year")
    expect(mockQuery.mock.calls[0][0]).toContain("make_interval(days => $2)");
    expect(mockQuery.mock.calls[0][1]).toContain(365);
  });

  it("returns specific metric with period filter", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { week: weekDate(0), volume: "8000" },
          { week: weekDate(1), volume: "7500" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({ metric: "volume", period: "month" });

    expect(result.structuredContent.period).toBe("month");
    expect(result.structuredContent.metric).toBe("volume");
    expect(result.structuredContent.volume_weekly).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledTimes(3); // Volume + 2 pending validation queries
  });

  it("body_weight metric returns null when no measurements exist", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({ metric: "body_weight" });

    // body_weight returns null -> gets filtered out of data
    expect(result.structuredContent.body_weight).toBeUndefined();
  });

  it("streak calculation handles current week with no sessions", async () => {
    // Only last week has sessions
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ week: weekDate(1), cnt: 3 }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });

    const result = await toolHandlers["show_dashboard"]({ metric: "streak" });

    expect(result.structuredContent.streak.current_weeks).toBe(1);
    expect(result.structuredContent.streak.this_week).toBe(0);
  });
});
