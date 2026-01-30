import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
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
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })
      .mockResolvedValueOnce({ rows: [{ id: 102 }] });

    const result = await toolHandler({
      exercise: "Bench Press", sets: 3, reps: 8, weight: 80, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.exercise_name).toBe("Bench Press");
    expect(parsed.is_new_exercise).toBe(false);
    expect(parsed.session_id).toBe(5);
    expect(parsed.logged_sets).toHaveLength(3);
  });

  it("auto-creates session when none active", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Squat", isNew: false });
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 20 }] })
      .mockResolvedValueOnce({ rows: [{ id: 30 }] })
      .mockResolvedValueOnce({ rows: [{ id: 200 }] });

    const result = await toolHandler({
      exercise: "Squat", sets: 1, reps: 5, weight: 100, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.session_id).toBe(20);
  });

  it("handles reps as array (variable reps per set)", async () => {
    mockResolve.mockResolvedValueOnce({ id: 1, name: "Pull-ups", isNew: false });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })
      .mockResolvedValueOnce({ rows: [{ id: 102 }] });

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
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const result = await toolHandler({
      exercise: "Deadlift", sets: 1, reps: 3, weight: 140, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.new_prs).toHaveLength(2);
    expect(parsed.new_prs[0].record_type).toBe("max_weight");
  });

  it("marks new exercise flag correctly", async () => {
    mockResolve.mockResolvedValueOnce({ id: 99, name: "Dragon Flag", isNew: true });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const result = await toolHandler({
      exercise: "Dragon Flag", sets: 1, reps: 5, set_type: "working",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.is_new_exercise).toBe(true);
  });
});
