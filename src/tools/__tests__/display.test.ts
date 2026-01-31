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

let toolHandler: Function;

vi.mock("../../helpers/tool-response.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../helpers/tool-response.js")>();
  return {
    ...orig,
    registerAppToolWithMeta: vi.fn((_server: any, _name: string, _config: any, handler: Function) => {
      toolHandler = handler;
    }),
  };
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDisplayTools } from "../display.js";
import { registerAppToolWithMeta } from "../../helpers/tool-response.js";

describe("show_profile display tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_profile",
      expect.objectContaining({
        title: "Show Profile",
        annotations: { readOnlyHint: true },
        _meta: { ui: { resourceUri: "ui://gym-tracker/profile.html" } },
      }),
      expect.any(Function)
    );
  });

  it("returns profile data with widget response format", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 80 } }],
    });

    const result = await toolHandler();
    expect(result.structuredContent.profile).toEqual({ name: "Franco", weight_kg: 80 });
    expect(result.content[0].text).toContain("Franco");
  });

  it("returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler();
    expect(result.structuredContent.profile).toEqual({});
    expect(result.content[0].text).toContain("empty");
  });
});
