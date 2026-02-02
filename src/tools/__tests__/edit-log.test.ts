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

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/date-helpers.js", () => ({
  getUserCurrentDate: vi.fn().mockResolvedValue("2024-01-15"),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEditLogTool } from "../edit-log.js";

let toolHandler: Function;

describe("edit_log tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerEditLogTool(server);
  });

  describe("update action", () => {
    it("updates weight on all sets", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: "2024-01-15" }] })
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({
          rows: [
            { set_number: 1, reps: 8, weight: 85, rpe: null, set_type: "working" },
            { set_number: 2, reps: 8, weight: 85, rpe: null, set_type: "working" },
            { set_number: 3, reps: 8, weight: 85, rpe: null, set_type: "working" },
          ],
        });

      const result = await toolHandler({
        exercise: "Bench Press", session: "today", action: "update", updates: { weight: 85 },
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sets_updated).toBe(3);
      expect(parsed.updated_sets).toHaveLength(3);
    });

    it("updates specific set numbers only", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: "2024-01-15" }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { set_number: 1, reps: 8, weight: 80, rpe: null, set_type: "working" },
            { set_number: 2, reps: 10, weight: 80, rpe: null, set_type: "working" },
          ],
        });

      const result = await toolHandler({
        exercise: "Bench Press", action: "update", updates: { reps: 10 }, set_numbers: [2],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sets_updated).toBe(1);
    });

    it("rejects update with no updates object", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: "2024-01-15" }] });

      const result = await toolHandler({ exercise: "Bench Press", action: "update" });
      expect(result.isError).toBe(true);
    });
  });

  describe("delete action", () => {
    it("deletes specific sets", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: "2024-01-15" }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // remaining sets check

      const result = await toolHandler({
        exercise: "Bench Press", action: "delete", set_numbers: [3],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
      expect(parsed.set_numbers).toEqual([3]);
    });

    it("deletes all sets and session_exercise when no set_numbers", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: "2024-01-15" }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await toolHandler({ exercise: "Bench Press", action: "delete" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
      expect(parsed.scope).toBe("all");
    });
  });

  describe("restore_session", () => {
    it("includes user_id in UPDATE query", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, started_at: "2024-01-15", deleted_at: "2024-01-16" }] })
        .mockResolvedValueOnce({});

      await toolHandler({ restore_session: 1 });

      // The UPDATE query should include AND user_id = $2
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("user_id");
      expect(updateCall[1]).toContain(1); // userId
    });
  });

  describe("delete_session", () => {
    it("includes user_id in UPDATE query", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, started_at: "2024-01-15", ended_at: "2024-01-15" }] })
        .mockResolvedValueOnce({});

      await toolHandler({ delete_session: 1 });

      // The UPDATE query should include AND user_id = $2
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("user_id");
      expect(updateCall[1]).toContain(1); // userId
    });
  });

  describe("delete_sessions bulk", () => {
    it("rejects without session IDs array", async () => {
      const result = await toolHandler({ delete_sessions: "[]" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("array of session IDs");
    });

    it("soft-deletes multiple sessions and reports not_found", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] });

      const result = await toolHandler({ delete_sessions: [1, 2, 3] });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.deleted).toEqual([1, 3]);
      expect(parsed.not_found).toEqual([2]);
    });

    it("handles JSON string workaround for delete_sessions", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const result = await toolHandler({ delete_sessions: JSON.stringify([5]) });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual([5]);
    });
  });

  it("returns error when exercise not found in session", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({
      exercise: "Bench Press", action: "update", updates: { weight: 100 },
    });
    expect(result.isError).toBe(true);
  });
});
