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

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTemplatesTool } from "../templates.js";

let toolHandler: Function;

describe("manage_templates tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerTemplatesTool(server);
  });

  describe("list action", () => {
    it("returns templates", async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: "1" }] });
      // Data query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, name: "Push Day", created_at: "2024-01-01", exercises: [{ exercise: "Bench Press" }] },
        ],
      });

      const result = await toolHandler({ action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.templates).toHaveLength(1);
      expect(parsed.templates[0].name).toBe("Push Day");
      expect(parsed.total).toBe(1);
    });
  });

  describe("save action", () => {
    it("creates template from last session", async () => {
      // Resolve "last" session
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      // Get session exercises
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, sort_order: 0, superset_group: null, rest_seconds: null, notes: null, set_count: "4", common_reps: 8, max_weight: 80, max_rpe: 8 },
        ],
      });

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT template
        .mockResolvedValueOnce({}) // INSERT template exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "save", name: "My Template", session_id: "last" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.template.name).toBe("My Template");
      expect(parsed.exercises_count).toBe(1);
      expect(result.content[0].text).toContain("My Template");
    });

    it("scopes session exercises query by user_id", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, sort_order: 0, superset_group: null, rest_seconds: null, notes: null, set_count: "4", common_reps: 8, max_weight: 80, max_rpe: 8 },
        ],
      });

      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await toolHandler({ action: "save", name: "Test", session_id: "last" });

      // The session exercises query (2nd call) should include user_id
      const sessionExQuery = mockQuery.mock.calls[1];
      expect(sessionExQuery[0]).toContain("s.user_id");
      expect(sessionExQuery[1]).toEqual([5, 1]); // [sid, userId]
    });

    it("errors when no name provided", async () => {
      const result = await toolHandler({ action: "save" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Name required");
    });
  });

  describe("start action", () => {
    it("creates session from template in a transaction", async () => {
      // Check no active session
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Find template
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 10 }] });
      // Get template exercises
      mockQuery.mockResolvedValueOnce({
        rows: [
          { exercise_id: 1, exercise_name: "Bench Press", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: 8, sort_order: 0, superset_group: null, rest_seconds: 120 },
        ],
      });

      // Transaction: BEGIN, INSERT session, INSERT session_exercise, COMMIT
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 20, started_at: "2024-01-15T10:00:00Z" }] }) // INSERT session
        .mockResolvedValueOnce({}) // INSERT session_exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "start", name: "My Template" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.session_id).toBe(20);
      expect(parsed.template).toBe("My Template");
      expect(parsed.planned_exercises).toHaveLength(1);
      expect(result.content[0].text).toContain("My Template");
      expect(mockClientQuery).toHaveBeenCalledWith("BEGIN");
      expect(mockClientQuery).toHaveBeenCalledWith("COMMIT");
    });

    it("errors when active session exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await toolHandler({ action: "start", name: "My Template" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("already an active session");
    });
  });

  describe("delete_bulk action", () => {
    it("rejects without names array", async () => {
      const result = await toolHandler({ action: "delete_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("names array required");
    });

    it("deletes multiple templates and reports not_found", async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ name: "Push Day" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ name: "Leg Day" }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "delete_bulk",
        names: ["Push Day", "NonExistent", "Leg Day"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["Push Day", "Leg Day"]);
      expect(parsed.not_found).toEqual(["NonExistent"]);
      expect(result.content[0].text).toContain("deleted");
    });

    it("handles JSON string workaround for names", async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ name: "Push Day" }] })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "delete_bulk",
        names: JSON.stringify(["Push Day"]),
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["Push Day"]);
    });
  });

  describe("delete action", () => {
    it("removes template", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "Old Template" }] });

      const result = await toolHandler({ action: "delete", name: "Old Template" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe("Old Template");
      expect(result.content[0].text).toContain("Old Template");
    });

    it("errors when not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({ action: "delete", name: "Nonexistent" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("not found");
    });
  });
});
