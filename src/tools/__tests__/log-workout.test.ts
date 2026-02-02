import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockClientQuery, mockRelease, mockConnect } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockRelease = vi.fn();
  return {
    mockQuery: vi.fn(),
    mockClientQuery,
    mockRelease,
    mockConnect: vi.fn(() => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  };
});

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: mockConnect },
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  resolveExercise: vi.fn(),
}));

vi.mock("../../helpers/stats-calculator.js", () => ({
  checkPRs: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: vi.fn(),
  inferTodayDay: vi.fn(),
}));

vi.mock("../../helpers/group-helpers.js", () => ({
  cloneGroups: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLogWorkoutTool } from "../log-workout.js";
import { resolveExercise } from "../../helpers/exercise-resolver.js";
import { checkPRs } from "../../helpers/stats-calculator.js";
import { getActiveProgram, inferTodayDay } from "../../helpers/program-helpers.js";

const mockResolve = resolveExercise as ReturnType<typeof vi.fn>;
const mockCheckPRs = checkPRs as ReturnType<typeof vi.fn>;
const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockInferTodayDay = inferTodayDay as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("log_workout tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    mockResolve.mockReset();
    mockCheckPRs.mockReset().mockResolvedValue([]);
    mockGetActiveProgram.mockReset();
    mockInferTodayDay.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerLogWorkoutTool(server);
  });

  // --- Session-only mode ---

  describe("session-only mode (no exercises)", () => {
    it("creates session and returns plan when no exercises given", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });
      // timezone query
      mockQuery.mockResolvedValueOnce({ rows: [{ timezone: null }] });
      mockInferTodayDay.mockResolvedValueOnce({ id: 5, day_label: "Push" });

      // Transaction: BEGIN, no active session, create session, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active session
        .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // create session
        .mockResolvedValueOnce({}); // COMMIT

      // plan exercises query (post-commit)
      mockQuery.mockResolvedValueOnce({
        rows: [{ name: "Bench Press", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, rest_seconds: null, notes: null }],
      });
      // last workout query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(10);
      expect(parsed.session_created).toBe(true);
      expect(parsed.program_day.label).toBe("Push");
      expect(parsed.program_day.exercises).toHaveLength(1);
    });

    it("reuses active session instead of erroring", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);

      // Transaction: BEGIN, active session found, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 99, started_at: "2024-01-15T09:00:00Z", program_day_id: null }] }) // active session
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(99);
      expect(parsed.session_created).toBe(false);
    });
  });

  // --- Single exercise mode ---

  describe("single exercise mode", () => {
    it("logs sets to existing session", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);
      mockResolve.mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });

      // Transaction: BEGIN, active session, logSingleExercise queries, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5, started_at: "2024-01-15T10:00:00Z", program_day_id: null }] }) // active session
        // logSingleExercise: session_exercise check (new), insert set x3
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert session_exercise (new, no existing)
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set 1
        .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // insert set 2
        .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // insert set 3
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        exercise: "Bench Press", sets: 3, reps: 8, weight: 80, set_type: "working",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.exercise_name).toBe("Bench Press");
      expect(parsed.session_id).toBe(5);
      expect(parsed.logged_sets).toHaveLength(3);
    });

    it("auto-creates session when none active", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);
      mockResolve.mockResolvedValueOnce({ id: 1, name: "Squat", isNew: false });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active session
        .mockResolvedValueOnce({ rows: [{ id: 20, started_at: "2024-01-15T10:00:00Z" }] }) // create session
        .mockResolvedValueOnce({ rows: [{ id: 30 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // insert set
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        exercise: "Squat", sets: 1, reps: 5, weight: 100, set_type: "working",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.session_id).toBe(20);
    });

    it("returns error when reps missing", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5, started_at: "2024-01-15T10:00:00Z", program_day_id: null }] }) // active session
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await toolHandler({
        exercise: "Bench Press", sets: 3, set_type: "working",
      });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Reps required");
    });

    it("reports new PRs", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);
      mockResolve.mockResolvedValueOnce({ id: 1, name: "Deadlift", isNew: false });
      mockCheckPRs.mockResolvedValueOnce([
        { record_type: "max_weight", value: 140, previous: 130 },
      ]);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5, started_at: "2024-01-15T10:00:00Z", program_day_id: null }] }) // active session
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        exercise: "Deadlift", sets: 1, reps: 3, weight: 140, set_type: "working",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.new_prs).toHaveLength(1);
    });
  });

  // --- Bulk exercise mode ---

  describe("bulk exercise mode", () => {
    it("logs multiple exercises in one transaction", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);
      mockResolve
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "Squat", isNew: false });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5, started_at: "2024-01-15T10:00:00Z", program_day_id: null }] }) // active session
        // Exercise 1
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
        // Exercise 2
        .mockResolvedValueOnce({ rows: [{ id: 11 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // insert set
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        exercises: [
          { exercise: "Bench Press", sets: 1, reps: 8, weight: 80, set_type: "working" },
          { exercise: "Squat", sets: 1, reps: 5, weight: 100, set_type: "working" },
        ],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exercises_logged).toHaveLength(2);

      // Single transaction
      const beginCalls = mockClientQuery.mock.calls.filter((c: any) => c[0] === "BEGIN");
      const commitCalls = mockClientQuery.mock.calls.filter((c: any) => c[0] === "COMMIT");
      expect(beginCalls).toHaveLength(1);
      expect(commitCalls).toHaveLength(1);
    });
  });

  // --- Program day mode ---

  describe("program day mode", () => {
    it("logs all exercises from a program day", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });
      // Find day by label
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push", weekdays: [1] }] });
      // Get day exercises
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, group_id: null, rest_seconds: null },
        ],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active session
        .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // create session
        // Routine exercise: session_exercise + 4 sets
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // set 1
        .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // set 2
        .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // set 3
        .mockResolvedValueOnce({ rows: [{ id: 103 }] }) // set 4
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ program_day: "Push" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(10);
      expect(parsed.day_label).toBe("Push");
      expect(parsed.routine_exercises).toHaveLength(1);
      expect(parsed.routine_exercises[0].exercise).toBe("Bench Press");
      expect(parsed.total_routine_sets).toBe(4);
      expect(parsed.total_routine_volume_kg).toBe(2560);
    });

    it("adds routine exercises to existing session", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });
      // Find day by label
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push", weekdays: [1] }] });
      // Get day exercises
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 2, target_reps: 10, target_weight: 60, target_rpe: null, sort_order: 0, group_id: null, rest_seconds: null },
        ],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 99, started_at: "2024-01-15T09:00:00Z", program_day_id: null }] }) // active session
        .mockResolvedValueOnce({}) // link program_day_id
        // Routine exercise
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // set 1
        .mockResolvedValueOnce({ rows: [{ id: 201 }] }) // set 2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ program_day: "Push" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(99);
      expect(parsed.routine_exercises).toHaveLength(1);
    });

    it("skips exercises in skip array", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push", weekdays: [1] }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, group_id: null, rest_seconds: null },
          { exercise_id: 2, exercise_name: "Overhead Press", exercise_type: "strength", target_sets: 3, target_reps: 10, target_weight: 50, target_rpe: null, sort_order: 1, group_id: null, rest_seconds: null },
        ],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active session
        .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // create session
        // Only OHP (bench skipped)
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // set 1
        .mockResolvedValueOnce({ rows: [{ id: 201 }] }) // set 2
        .mockResolvedValueOnce({ rows: [{ id: 202 }] }) // set 3
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        program_day: "Push",
        skip: ["Bench Press"],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.routine_exercises).toHaveLength(1);
      expect(parsed.routine_exercises[0].exercise).toBe("Overhead Press");
    });

    it("applies overrides to specific exercises", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, day_label: "Push", weekdays: [1] }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, exercise_name: "Bench Press", exercise_type: "strength", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: null, sort_order: 0, group_id: null, rest_seconds: null },
        ],
      });

      mockResolve.mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active session
        .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] }) // create session
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // set 1
        .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // set 2
        .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // set 3
        .mockResolvedValueOnce({ rows: [{ id: 103 }] }) // set 4
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        program_day: "Push",
        overrides: [{ exercise: "Bench Press", weight: 90 }],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.routine_exercises[0].weight).toBe(90);
      expect(parsed.total_routine_volume_kg).toBe(2880); // 90 * 8 * 4
    });

    it("returns error when no active program", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);

      const result = await toolHandler({ program_day: "Push" });
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

  // --- Minimal response ---

  describe("minimal_response", () => {
    it("returns condensed output when minimal_response is true", async () => {
      mockGetActiveProgram.mockResolvedValueOnce(null);
      mockResolve.mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5, started_at: "2024-01-15T10:00:00Z", program_day_id: null }] }) // active session
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // insert session_exercise
        .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        exercise: "Bench Press", sets: 1, reps: 8, weight: 80, set_type: "working",
        minimal_response: true,
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.exercises_logged).toBe(1);
      expect(parsed.logged_sets).toBeUndefined();
    });
  });
});
