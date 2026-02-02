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
import { registerWorkoutTool } from "../workout.js";
import { registerAppToolWithMeta } from "../../helpers/tool-response.js";

describe("show_workout display tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    const server = {} as unknown as McpServer;
    registerWorkoutTool(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerWorkoutTool(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_workout",
      expect.objectContaining({
        title: "Active Workout",
        annotations: { readOnlyHint: true },
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/workout.html" } }),
      }),
      expect.any(Function)
    );
  });

  it("returns null session when no sessions exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_workout"]({});

    expect(result.structuredContent.session).toBeNull();
    expect(result.content[0].text).toContain("No workout sessions found");
  });

  it("returns null session when specific session_id not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_workout"]({ session_id: 999 });

    expect(result.structuredContent.session).toBeNull();
    expect(result.content[0].text).toContain("Session not found");
  });

  it("returns session data without exerciseCatalog", async () => {
    const startedAt = new Date(Date.now() - 30 * 60000).toISOString();
    mockQuery
      // Session query
      .mockResolvedValueOnce({
        rows: [{ id: 42, started_at: startedAt, ended_at: null, program_day_id: null, tags: [] }],
      })
      // Exercise details
      .mockResolvedValueOnce({
        rows: [{
          name: "Bench Press", superset_group: null, muscle_group: "chest",
          exercise_type: "strength", rep_type: "reps",
          sets: [{ set_id: 1, set_number: 1, reps: 10, weight: 80, rpe: 7, set_type: "working", logged_at: startedAt }],
        }],
      })
      // Previous workout
      .mockResolvedValueOnce({ rows: [] })
      // PRs
      .mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_workout"]({});

    expect(result.structuredContent.session).toBeTruthy();
    expect(result.structuredContent.session.session_id).toBe(42);
    expect(result.structuredContent.exerciseCatalog).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
    expect(result.content[0].text).not.toContain("inline editing");
  });

  it("marks ended sessions as readonly", async () => {
    const startedAt = new Date(Date.now() - 60 * 60000).toISOString();
    const endedAt = new Date(Date.now() - 30 * 60000).toISOString();
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 10, started_at: startedAt, ended_at: endedAt, program_day_id: null, tags: [] }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_workout"]({ session_id: 10 });

    expect(result.structuredContent.session.ended_at).toBe(endedAt);
    expect(result.structuredContent.readonly).toBe(true);
  });
});
