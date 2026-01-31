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
  getProgramDaysWithExercises: vi.fn(),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "../session.js";
import { getActiveProgram, inferTodayDay } from "../../helpers/program-helpers.js";

const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockInferTodayDay = inferTodayDay as ReturnType<typeof vi.fn>;

let startHandler: Function;
let endHandler: Function;
let getActiveHandler: Function;

describe("session tools", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetActiveProgram.mockReset();
    mockInferTodayDay.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        if (_name === "start_session") startHandler = handler;
        if (_name === "end_session") endHandler = handler;
        if (_name === "get_active_session") getActiveHandler = handler;
      }),
    } as unknown as McpServer;
    registerSessionTools(server);
  });

  describe("start_session", () => {
    it("returns error if session already active", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, started_at: "2024-01-01" }],
      });

      const result = await startHandler({});
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(parsed.error).toContain("already an active session");
    });

    it("creates session without program when none active", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z" }],
        });
      mockGetActiveProgram.mockResolvedValueOnce(null);

      const result = await startHandler({});
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(10);
    });

    it("creates session with program day when specified", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 5, day_label: "Push", weekdays: [1] }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 20, started_at: "2024-01-15T10:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ name: "Bench Press", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: 8, rest_seconds: 120, notes: null }],
        })
        .mockResolvedValueOnce({ rows: [] });

      mockGetActiveProgram.mockResolvedValueOnce({
        id: 1, name: "PPL", version_id: 3, version_number: 1,
      });

      const result = await startHandler({ program_day: "Push" });
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(20);
      expect(parsed.program_day.label).toBe("Push");
    });

    it("handles JSON-stringified tags", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 10, started_at: "2024-01-15T10:00:00Z", tags: ["deload"] }],
        });
      mockGetActiveProgram.mockResolvedValueOnce(null);

      const result = await startHandler({ tags: JSON.stringify(["deload"]) });
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

      expect(parsed.session_id).toBe(10);
      // Verify the INSERT was called with a parsed array, not a JSON string
      const insertCall = mockQuery.mock.calls[1];
      // tags is the 6th param [userId, programVersionId, programDayId, notes, startedAt, tags]
      const tagsParam = insertCall[1][5];
      expect(Array.isArray(tagsParam)).toBe(true);
      expect(tagsParam).toEqual(["deload"]);
    });
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
            { name: "Bench Press", superset_group: null, sets: [{ set_number: 1, reps: 8, weight: 80, rpe: 8, set_type: "working" }] },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ program_day_id: null }] }); // comparison query

      const result = await endHandler({ notes: "Great workout" });
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

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
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

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
            { name: "Bench Press", superset_group: null, sets: [{ set_id: 1, set_number: 1, reps: 8, weight: 80, rpe: null, set_type: "working" }] },
          ],
        });

      const result = await getActiveHandler({});
      const parsed = result.structuredContent ?? JSON.parse(result.content[0].text);

      expect(parsed.active).toBe(true);
      expect(parsed.session_id).toBe(10);
      expect(parsed.program_day).toBe("Push");
      expect(parsed.tags).toEqual(["morning"]);
      expect(parsed.exercises).toHaveLength(1);
    });
  });
});
