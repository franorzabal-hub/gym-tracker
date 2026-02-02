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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "../session.js";

let endHandler: Function;
let getActiveHandler: Function;

describe("session tools", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        if (_name === "end_session") endHandler = handler;
        if (_name === "get_active_session") getActiveHandler = handler;
      }),
    } as unknown as McpServer;
    registerSessionTools(server);
  });

  describe("end_session", () => {
    it("returns error if no active session", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await endHandler({});
      expect(result.isError).toBe(true);
    });

    it("ends session and returns summary", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }] })
        .mockResolvedValueOnce({ rows: [{ exercise_count: "3", set_count: "10" }] }) // exerciseCheck
        .mockResolvedValueOnce({}) // UPDATE ended_at
        .mockResolvedValueOnce({
          rows: [{
            started_at: "2024-01-15T10:00:00Z",
            ended_at: "2024-01-15T11:00:00Z",
            duration_minutes: 60,
            exercises_count: "5",
            total_sets: "20",
            total_volume_kg: "5000",
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { name: "Bench Press", group_id: null, group_type: null, group_label: null, sets: [{ set_number: 1, reps: 8, weight: 80, rpe: 8, set_type: "working" }] },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ program_day_id: null }] }); // comparison query

      const result = await endHandler({ notes: "Great workout" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(10);
      expect(parsed.duration_minutes).toBe(60);
      expect(parsed.exercises_count).toBe(5);
      expect(parsed.total_sets).toBe(20);
      expect(parsed.total_volume_kg).toBe(5000);
    });
  });

  describe("get_active_session", () => {
    it("returns inactive when no open session", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getActiveHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.active).toBe(false);
    });

    it("returns active session with exercises", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z", program_day_id: 5, tags: ["morning"] }],
        })
        .mockResolvedValueOnce({ rows: [{ day_label: "Push" }] }) // program day lookup
        .mockResolvedValueOnce({
          rows: [
            { name: "Bench Press", group_id: null, group_type: null, group_label: null, sets: [{ set_id: 1, set_number: 1, reps: 8, weight: 80, rpe: null, set_type: "working" }] },
          ],
        });

      const result = await getActiveHandler({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.active).toBe(true);
      expect(parsed.session_id).toBe(10);
      expect(parsed.program_day).toBe("Push");
      expect(parsed.tags).toEqual(["morning"]);
      expect(parsed.exercises).toHaveLength(1);
    });
  });
});
