import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockGetActiveProgram, mockGetProgramDaysWithExercises } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetActiveProgram: vi.fn(),
  mockGetProgramDaysWithExercises: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: mockGetActiveProgram,
  getProgramDaysWithExercises: mockGetProgramDaysWithExercises,
}));

const toolHandlers: Record<string, Function> = {};

vi.mock("../../helpers/tool-response.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../helpers/tool-response.js")>();
  return {
    ...orig,
    registerAppToolWithMeta: vi.fn((_server: any, name: string, _config: any, handler: Function) => {
      toolHandlers[name] = handler;
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

    const result = await toolHandlers["show_profile"]();
    expect(result.structuredContent.profile).toEqual({ name: "Franco", weight_kg: 80 });
    expect(result.content[0].text).toContain("Do NOT repeat");
  });

  it("returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_profile"]();
    expect(result.structuredContent.profile).toEqual({});
    expect(result.content[0].text).toContain("Do NOT repeat");
  });
});

describe("show_onboarding display tool", () => {
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
      "show_onboarding",
      expect.objectContaining({
        title: "Onboarding",
        annotations: { readOnlyHint: true },
        _meta: { ui: { resourceUri: "ui://gym-tracker/onboarding.html" } },
      }),
      expect.any(Function)
    );
  });

  it("returns profile data and templates with exercises", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 80 } }],
    });

    const result = await toolHandlers["show_onboarding"]();

    expect(result.content[0].text).toContain("Do NOT");
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.profile).toEqual({ name: "Franco", weight_kg: 80 });

    const templates = result.structuredContent.templates;
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);

    const first = templates[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first.days.length).toBeGreaterThan(0);
    expect(first.days[0].exercises[0]).toHaveProperty("name");
  });

  it("returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_onboarding"]();
    expect(result.structuredContent.profile).toEqual({});
    expect(result.structuredContent.templates.length).toBeGreaterThan(0);
  });
});

describe("show_program display tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetActiveProgram.mockReset();
    mockGetProgramDaysWithExercises.mockReset();
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_program",
      expect.objectContaining({
        title: "Show Program",
        annotations: { readOnlyHint: true },
        _meta: { ui: { resourceUri: "ui://gym-tracker/programs.html" } },
      }),
      expect.any(Function)
    );
  });

  it("returns active program with days and exercises", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", description: "Push Pull Legs",
      version_id: 10, version_number: 2,
    });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: 8 }] },
      { day_label: "Pull", exercises: [{ exercise_name: "Barbell Row", target_sets: 4, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({});

    expect(result.structuredContent.program.name).toBe("PPL");
    expect(result.structuredContent.program.version).toBe(2);
    expect(result.structuredContent.program.days).toHaveLength(2);
    expect(result.content[0].text).toContain("Do NOT repeat");
  });

  it("returns null program when none found", async () => {
    mockGetActiveProgram.mockResolvedValueOnce(null);

    const result = await toolHandlers["show_program"]({});

    expect(result.structuredContent.program).toBeNull();
    expect(result.content[0].text).toContain("No program found");
  });

  it("looks up program by name when provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 2, name: "Full Body", description: null, version_id: 5, version_number: 1 }],
    });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Day A", exercises: [{ exercise_name: "Squat", target_sets: 3, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({ name: "Full Body" });

    expect(result.structuredContent.program.name).toBe("Full Body");
    expect(result.structuredContent.program.days).toHaveLength(1);
  });
});
