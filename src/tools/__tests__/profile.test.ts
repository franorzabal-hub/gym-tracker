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
import { registerProfileTool } from "../profile.js";

let toolHandler: Function;

describe("manage_profile tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerProfileTool(server);
  });

  it("registers with correct name", () => {
    const server = { registerTool: vi.fn() } as unknown as McpServer;
    registerProfileTool(server);
    expect(server.registerTool).toHaveBeenCalledWith(
      "manage_profile",
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("get action returns profile data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 80 } }],
    });

    const result = await toolHandler({ action: "get" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.profile).toEqual({ name: "Franco", weight_kg: 80 });
  });

  it("get action returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ action: "get" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.profile).toEqual({});
  });

  it("update action merges data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 82 } }],
    });

    const result = await toolHandler({ action: "update", data: { weight_kg: 82 } });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.profile).toBeDefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id)"),
      [1, JSON.stringify({ weight_kg: 82 })]
    );
  });

  it("update action rejects empty data", async () => {
    const result = await toolHandler({ action: "update", data: {} });
    expect(result.isError).toBe(true);
  });

  it("update action rejects missing data", async () => {
    const result = await toolHandler({ action: "update" });
    expect(result.isError).toBe(true);
  });
});
