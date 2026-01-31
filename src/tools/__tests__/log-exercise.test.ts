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

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLogExerciseTool } from "../log-exercise.js";
import { resolveExercise } from "../../helpers/exercise-resolver.js";
import { checkPRs } from "../../helpers/stats-calculator.js";

const mockResolve = resolveExercise as ReturnType<typeof vi.fn>;
const mockCheckPRs = checkPRs as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("log_exercise tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    mockResolve.mockReset();
    mockCheckPRs.mockReset().mockResolvedValue([]);

    const server = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerLogExerciseTool(server);
  });

  it("logs sets to existing session", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });
    // pool.query: get active session
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    // client.query: BEGIN, session_exercise check, insert session_exercise, 3x insert set, COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set 1
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // insert set 2
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // insert set 3
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      exercise: "Bench Press", sets: 3, reps: 8, weight: 80, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exercise_name).toBe("Bench Press");
    expect(parsed.is_new_exercise).toBe(false);
    expect(parsed.session_id).toBe(5);
    expect(parsed.logged_sets).toHaveLength(3);
    expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
    expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("auto-creates session when none active", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Squat", isNew: false });
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no active session
      .mockResolvedValueOnce({ rows: [{ id: 20 }] }); // create session
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 30 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 200 }] }) // insert set
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      exercise: "Squat", sets: 1, reps: 5, weight: 100, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.session_id).toBe(20);
  });

  it("handles reps as array (variable reps per set)", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Pull-ups", isNew: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set 1
      .mockResolvedValueOnce({ rows: [{ id: 101 }] }) // insert set 2
      .mockResolvedValueOnce({ rows: [{ id: 102 }] }) // insert set 3
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      exercise: "Pull-ups", sets: 1, reps: [10, 8, 6], set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.logged_sets).toHaveLength(3);
    expect(parsed.logged_sets[0].reps).toBe(10);
    expect(parsed.logged_sets[1].reps).toBe(8);
    expect(parsed.logged_sets[2].reps).toBe(6);
  });

  it("reports new PRs", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Deadlift", isNew: false });
    mockCheckPRs.mockResolvedValueOnce([
      { record_type: "max_weight", value: 140, previous: 130 },
      { record_type: "estimated_1rm", value: 155, previous: 145 },
    ]);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      exercise: "Deadlift", sets: 1, reps: 3, weight: 140, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.new_prs).toHaveLength(2);
    expect(parsed.new_prs[0].record_type).toBe("max_weight");
  });

  it("marks new exercise flag correctly", async () => {
    mockResolve.mockResolvedValueOnce({ id: 99, name: "Dragon Flag", isNew: true });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
      .mockResolvedValueOnce({}); // COMMIT

    const result = await toolHandler({
      exercise: "Dragon Flag", sets: 1, reps: 5, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.is_new_exercise).toBe(true);
  });

  it("wraps bulk mode in a single transaction", async () => {
    mockResolve
      .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
      .mockResolvedValueOnce({ id: 2, name: "Squat", isNew: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      // Exercise 1
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // session_exercise check (new)
      .mockResolvedValueOnce({ rows: [{ id: 100 }] }) // insert set
      // Exercise 2
      .mockResolvedValueOnce({ rows: [{ id: 11 }] }) // session_exercise check (new)
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

    // Verify single transaction: exactly one BEGIN and one COMMIT
    const beginCalls = mockClientQuery.mock.calls.filter((c: any) => c[0] === "BEGIN");
    const commitCalls = mockClientQuery.mock.calls.filter((c: any) => c[0] === "COMMIT");
    expect(beginCalls).toHaveLength(1);
    expect(commitCalls).toHaveLength(1);
  });
});
