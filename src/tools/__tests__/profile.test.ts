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
    expect(JSON.parse(result.content[0].text).profile).toEqual({ name: "Franco", weight_kg: 80 });
  });

  it("get action returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({ action: "get" });
    expect(JSON.parse(result.content[0].text).profile).toEqual({});
  });

  it("update action merges data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 82 } }],
    });

    const result = await toolHandler({ action: "update", data: { weight_kg: 82 } });
    expect(JSON.parse(result.content[0].text).profile).toBeDefined();
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

  it("update action rejects invalid types", async () => {
    const result = await toolHandler({ action: "update", data: { weight_kg: "not a number" } });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain("Invalid");
  });

  it("update action rejects out-of-range values", async () => {
    const result = await toolHandler({ action: "update", data: { age: -5 } });
    expect(result.isError).toBe(true);

    const result2 = await toolHandler({ action: "update", data: { age: 200 } });
    expect(result2.isError).toBe(true);
  });

  it("update action rejects oversized payload", async () => {
    const hugeData = { notes: "A".repeat(100000) };
    const result = await toolHandler({ action: "update", data: hugeData });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain("size");
  });

  it("update action validates requires_validation as boolean", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { requires_validation: true } }],
    });
    const result = await toolHandler({ action: "update", data: { requires_validation: true } });
    expect(result.isError).toBeFalsy();
  });

  it("update action normalizes injuries array", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { injuries: ["shoulder pain"] } }],
    });
    // "nada" and empty strings should be filtered out
    const result = await toolHandler({ action: "update", data: { injuries: ["shoulder pain", "nada", "", "none"] } });
    expect(result.isError).toBeFalsy();
  });
});
