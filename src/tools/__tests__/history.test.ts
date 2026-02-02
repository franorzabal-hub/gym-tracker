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

vi.mock("../../helpers/date-helpers.js", () => ({
  getUserCurrentDate: vi.fn().mockResolvedValue("2024-01-15"),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHistoryTool } from "../history.js";

let toolHandler: Function;

describe("get_history tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerHistoryTool(server);
  });

  it("returns sessions for default period (week)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          session_id: 1,
          started_at: "2024-01-15T10:00:00Z",
          ended_at: "2024-01-15T11:00:00Z",
          program_day: "Push",
          exercises: [
            { exercise: "Bench Press", sets: [{ set_id: 1, set_number: 1, reps: 8, weight: 80, rpe: null, set_type: "working", notes: null }] },
          ],
        },
      ],
    });

    const result = await toolHandler({ period: "week" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.summary.total_sessions).toBe(1);
    expect(parsed.summary.total_volume_kg).toBe(640); // 80 * 8
    expect(parsed.summary.exercises_count).toBe(1);
  });

  it("filters by exercise name", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ period: "month", exercise: "press banca" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sessions).toEqual([]);
    // Verify the query included exercise filter
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      expect.arrayContaining(["%press banca%"])
    );
  });

  it("filters by program_day", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ period: "week", program_day: "Push" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sessions).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("LOWER(pd.day_label)"),
      expect.arrayContaining(["push"])
    );
  });

  it("returns empty when no sessions", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ period: "today" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sessions).toEqual([]);
    expect(parsed.summary.total_sessions).toBe(0);
    expect(parsed.summary.total_volume_kg).toBe(0);
    expect(parsed.summary.exercises_count).toBe(0);
  });

  it("handles JSON-stringified tags", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ period: "week", tags: JSON.stringify(["morning"]) });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sessions).toEqual([]);
    // Verify the query included the tags filter with a real array
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("tags"),
      expect.arrayContaining([["morning"]])
    );
  });

  it("calculates volume summary correctly", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          session_id: 1,
          started_at: "2024-01-15",
          ended_at: "2024-01-15",
          program_day: null,
          exercises: [
            {
              exercise: "Squat",
              sets: [
                { set_id: 1, set_number: 1, reps: 5, weight: 100, rpe: null, set_type: "working", notes: null },
                { set_id: 2, set_number: 2, reps: 5, weight: 100, rpe: null, set_type: "working", notes: null },
                { set_id: 3, set_number: 3, reps: 3, weight: 60, rpe: null, set_type: "warmup", notes: null },
              ],
            },
          ],
        },
      ],
    });

    const result = await toolHandler({ period: "week" });
    const parsed = JSON.parse(result.content[0].text);

    // Only working sets: (100*5) + (100*5) = 1000. Warmup excluded.
    expect(parsed.summary.total_volume_kg).toBe(1000);
  });
});
