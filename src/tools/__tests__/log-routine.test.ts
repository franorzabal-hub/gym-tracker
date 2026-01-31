import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockClientQuery, mockClient } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClient = {
    query: mockClientQuery,
    release: vi.fn(),
  };
  return {
    mockQuery: vi.fn(),
    mockClientQuery,
    mockClient,
  };
});

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn().mockResolvedValue(mockClient) },
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: vi.fn(),
  inferTodayDay: vi.fn(),
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  resolveExercise: vi.fn(),
}));

vi.mock("../../helpers/stats-calculator.js", () => ({
  checkPRs: vi.fn(),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLogRoutineTool } from "../log-routine.js";
import { getActiveProgram, inferTodayDay } from "../../helpers/program-helpers.js";
import { resolveExercise } from "../../helpers/exercise-resolver.js";
import { checkPRs } from "../../helpers/stats-calculator.js";

const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockInferTodayDay = inferTodayDay as ReturnType<typeof vi.fn>;
const mockResolveExercise = resolveExercise as ReturnType<typeof vi.fn>;
const mockCheckPRs = checkPRs as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("log_routine tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockGetActiveProgram.mockReset();
    mockInferTodayDay.mockReset();
    mockResolveExercise.mockReset();
    mockCheckPRs.mockReset();

    const server = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerLogRoutineTool(server);
  });

  it("rejects when active session exists", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });
    // timezone query
    mockQuery.mockResolvedValueOnce({ rows: [{ timezone: null }] });
    mockInferTodayDay.mockResolvedValueOnce({ id: 5, day_label: "Push" });
    // day exercises
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Transaction: BEGIN, then active session found
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 99, started_at: "2024-01-15T09:00:00Z" }],
      }) // active session check
      .mockResolvedValueOnce({}); // ROLLBACK

    const result = await toolHandler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("already an active session");
    expect(parsed.session_id).toBe(99);
  });

  it("logs routine for inferred day", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });

    // timezone query
    mockQuery.mockResolvedValueOnce({ rows: [{ timezone: null }] });
    mockInferTodayDay.mockResolvedValueOnce({ id: 5, day_label: "Push" });

    // Get exercises for the day
    mockQuery.mockResolvedValueOnce({
      rows: [
        { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, superset_group: null, rest_seconds: null },
      ],
    });

    // Transaction queries via client
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // active session check — no active session
      .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // Create session
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // Create session_exercise
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // set 1
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // set 2
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // set 3
      .mockResolvedValueOnce({ rows: [{ id: 103 }] }) // set 4
    ;
    // checkPRs
    mockCheckPRs.mockResolvedValueOnce([]);
    // End session + COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // end session
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.session_id).toBe(10);
    expect(parsed.day_label).toBe("Push");
    expect(parsed.exercises_logged).toHaveLength(1);
    expect(parsed.exercises_logged[0].exercise).toBe("Bench Press");
    expect(parsed.total_sets).toBe(4);
    expect(parsed.total_volume_kg).toBe(2560); // 80 * 8 * 4
  });

  it("logs with explicit program_day label", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });

    // Find day by label
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Pull" }] });
    // Get exercises for the day (empty for simplicity)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Transaction queries via client
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // active session check — no active session
      .mockResolvedValueOnce({ rows: [{ id: 11, started_at: "2024-01-15T10:00:00Z" }] }) // Create session
      .mockResolvedValueOnce({}) // End session
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({ program_day: "Pull" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.day_label).toBe("Pull");
    expect(parsed.total_sets).toBe(0);
  });

  it("applies overrides to specific exercises", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });

    // Find day by label
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push" }] });
    // Get exercises for the day
    mockQuery.mockResolvedValueOnce({
      rows: [
        { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, superset_group: null, rest_seconds: null },
      ],
    });

    // resolveExercise for override
    mockResolveExercise.mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });

    // Transaction queries via client
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // active session check — no active session
      .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // Create session
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // Create session_exercise
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // set 1
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // set 2
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // set 3
      .mockResolvedValueOnce({ rows: [{ id: 103 }] }) // set 4
    ;
    mockCheckPRs.mockResolvedValueOnce([]);
    // End session + COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // end session
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      program_day: "Push",
      overrides: [{ exercise: "Bench Press", weight: 90 }],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exercises_logged[0].weight).toBe(90);
    expect(parsed.total_volume_kg).toBe(2880); // 90 * 8 * 4
  });

  it("skips exercises in skip array", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });

    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push" }] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, superset_group: null, rest_seconds: null },
        { exercise_id: 2, exercise_name: "Overhead Press", exercise_type: "strength", target_sets: 3, target_reps: 10, target_weight: 50, target_rpe: null, sort_order: 1, superset_group: null, rest_seconds: null },
      ],
    });

    // Transaction queries via client
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // active session check — no active session
      .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // Create session
      .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // session_exercise for OHP (bench skipped)
      .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // set 1
      .mockResolvedValueOnce({ rows: [{ id: 201 }] }) // set 2
      .mockResolvedValueOnce({ rows: [{ id: 202 }] }) // set 3
    ;
    mockCheckPRs.mockResolvedValueOnce([]);
    // End session + COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // end session
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      program_day: "Push",
      skip: ["Bench Press"],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exercises_logged).toHaveLength(1);
    expect(parsed.exercises_logged[0].exercise).toBe("Overhead Press");
  });

  it("returns error when no active program", async () => {
    mockGetActiveProgram.mockResolvedValueOnce(null);

    const result = await toolHandler({});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("No active program");
  });

  it("returns error when day not found", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", version_id: 3, version_number: 1,
    });

    mockQuery.mockResolvedValueOnce({ rows: [] }); // day not found

    const result = await toolHandler({ program_day: "Arms" });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("No program day found");
  });
});
