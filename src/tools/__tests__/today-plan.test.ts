import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: vi.fn(),
  inferTodayDay: vi.fn(),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTodayPlanTool } from "../today-plan.js";
import { getActiveProgram, inferTodayDay } from "../../helpers/program-helpers.js";

const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockInferTodayDay = inferTodayDay as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("get_today_plan tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetActiveProgram.mockReset();
    mockInferTodayDay.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerTodayPlanTool(server);
  });

  it("returns error when no active program", async () => {
    mockGetActiveProgram.mockResolvedValueOnce(null);

    const result = await toolHandler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("No active program");
  });

  it("returns rest_day when no day mapped to today", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({ id: 1, name: "PPL", version_id: 3 });
    mockQuery.mockResolvedValueOnce({ rows: [{ timezone: "America/New_York" }] }); // profile
    mockInferTodayDay.mockResolvedValueOnce(null);

    const result = await toolHandler({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.rest_day).toBe(true);
    expect(parsed.program).toBe("PPL");
  });

  it("returns today's exercises and last workout", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({ id: 1, name: "PPL", version_id: 3 });
    mockQuery.mockResolvedValueOnce({ rows: [{ timezone: "America/New_York" }] }); // profile
    mockInferTodayDay.mockResolvedValueOnce({ id: 5, day_label: "Push" });

    // Exercises for today
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: "Bench Press", rep_type: "reps", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: 8, rest_seconds: 120, notes: null, superset_group: null },
        { name: "Incline DB Press", rep_type: "reps", exercise_type: "strength", target_sets: 3, target_reps: 10, target_weight: 30, target_rpe: 7, rest_seconds: 90, notes: null, superset_group: null },
      ],
    });

    // Last session for this day
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 20, started_at: "2024-01-10T10:00:00Z" }],
    });

    // Last session exercises
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: "Bench Press", sets: [{ set_number: 1, reps: 8, weight: 80, rpe: 8, set_type: "working" }] },
      ],
    });

    const result = await toolHandler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.program).toBe("PPL");
    expect(parsed.day).toBe("Push");
    expect(parsed.exercises).toHaveLength(2);
    expect(parsed.exercises[0].name).toBe("Bench Press");
    expect(parsed.exercises[0].target_sets).toBe(4);
    expect(parsed.last_workout.date).toBe("2024-01-10T10:00:00Z");
    expect(parsed.last_workout.exercises).toHaveLength(1);
  });

  it("returns exercises without last_workout when no previous session", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({ id: 1, name: "PPL", version_id: 3 });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // profile (no timezone)
    mockInferTodayDay.mockResolvedValueOnce({ id: 5, day_label: "Legs" });

    // Exercises
    mockQuery.mockResolvedValueOnce({
      rows: [{ name: "Squat", rep_type: "reps", exercise_type: "strength", target_sets: 5, target_reps: 5, target_weight: 100, target_rpe: 9, rest_seconds: 180, notes: null, superset_group: null }],
    });

    // No previous session
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.day).toBe("Legs");
    expect(parsed.exercises).toHaveLength(1);
    expect(parsed.last_workout).toBeUndefined();
  });
});
