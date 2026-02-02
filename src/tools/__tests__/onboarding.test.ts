import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery },
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOnboardingTool } from "../onboarding.js";

let toolHandler: Function;

describe("initialize_gym_session tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerOnboardingTool(server);
  });

  it("returns required_next_tool=show_profile for new user", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no profile
      .mockResolvedValueOnce({ rows: [] }) // no program
      .mockResolvedValueOnce({ rows: [] }); // no sessions

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.is_new_user).toBe(true);
    expect(data.required_next_tool).toBe("show_profile");
  });

  it("returns required_next_tool=show_programs when profile complete but no program", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan", experience: "beginner", available_days: 3 } }] })
      .mockResolvedValueOnce({ rows: [] }) // no program
      .mockResolvedValueOnce({ rows: [] }); // no sessions

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.is_new_user).toBe(false);
    expect(data.required_next_tool).toBe("show_programs");
  });

  it("detects fully set up user", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan" } }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // has program
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // has sessions

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.is_new_user).toBe(false);
    expect(data.required_next_tool).toBeNull();
    expect(data.suggestion).toBeNull();
  });

  it("suggests updating profile when incomplete and not new user", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: {} }] }) // profile exists but no name
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // has program
      .mockResolvedValueOnce({ rows: [] }); // no sessions

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_next_tool).toBeNull();
    expect(data.suggestion).toContain("Profile incomplete");
  });

  it("uses default values when profile has no experience or available_days", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Juan" } }] })
      .mockResolvedValueOnce({ rows: [] }) // no program
      .mockResolvedValueOnce({ rows: [] }); // no sessions

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.required_next_tool).toBe("show_programs");
  });
});
