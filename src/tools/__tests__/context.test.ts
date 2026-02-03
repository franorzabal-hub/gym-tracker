import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery },
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  inferTodayDay: vi.fn().mockResolvedValue(null),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContextTool } from "../context.js";

let toolHandler: Function;

describe("get_context tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerContextTool(server);
  });

  it("returns required_action=setup_profile for new user", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no profile
      .mockResolvedValueOnce({ rows: [] }) // no program
      .mockResolvedValueOnce({ rows: [] }) // no sessions (history check)
      .mockResolvedValueOnce({ rows: [] }); // no active workout

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_action).toBe("setup_profile");
  });

  it("returns required_action=choose_program when profile complete but no program", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan", experience_level: "beginner", available_days: 3 } }] })
      .mockResolvedValueOnce({ rows: [] }) // no program
      .mockResolvedValueOnce({ rows: [] }) // no sessions
      .mockResolvedValueOnce({ rows: [] }); // no active workout

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_action).toBe("choose_program");
  });

  it("detects fully set up user with active program", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan", experience_level: "intermediate" } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL", version_id: 1 }] }) // has program
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // has sessions
      .mockResolvedValueOnce({ rows: [] }); // no active workout

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_action).toBeNull();
    expect(data.program.active).toBe("PPL");
  });

  it("suggests updating profile when incomplete and not new user", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: {} }] }) // profile exists but no name
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL", version_id: 1 }] }) // has program
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // has sessions
      .mockResolvedValueOnce({ rows: [] }); // no active workout

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_action).toBeNull();
    expect(data.suggestion).toContain("Profile incomplete");
  });

  it("returns active_workout info when workout in progress", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan", experience_level: "advanced" } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL", version_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // has sessions
      .mockResolvedValueOnce({ rows: [{ id: 10, started_at: new Date(Date.now() - 30 * 60000).toISOString(), program_day_id: 5, tags: ["morning"] }] })
      .mockResolvedValueOnce({ rows: [{ day_label: "Push" }] }) // program day lookup
      .mockResolvedValueOnce({ rows: [{ exercise_count: "3", set_count: "10" }] }); // counts

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.active_workout).not.toBeNull();
    expect(data.active_workout.id).toBe(10);
    expect(data.active_workout.program_day).toBe("Push");
    expect(data.suggestion).toContain("Active workout");
  });
});
