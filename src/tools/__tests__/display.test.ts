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
        annotations: { readOnlyHint: true, openWorldHint: false },
        inputSchema: expect.objectContaining({ preview: expect.anything() }),
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/profile.html" } }),
      }),
      expect.any(Function)
    );
  });

  it("returns profile data with widget response format", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 80 } }],
    });

    const result = await toolHandlers["show_profile"]({});
    expect(result.structuredContent.profile).toEqual({ name: "Franco", weight_kg: 80 });
    expect(result.structuredContent.pendingChanges).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
  });

  it("returns empty profile when no data", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_profile"]({});
    expect(result.structuredContent.profile).toEqual({});
    expect(result.content[0].text).toContain("Do NOT describe");
  });

  it("includes pendingChanges when preview provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco", weight_kg: 80, gym: "SmartFit" } }],
    });

    const result = await toolHandlers["show_profile"]({ preview: { weight_kg: 85, gym: "Iron Paradise" } });
    expect(result.structuredContent.profile).toEqual({ name: "Franco", weight_kg: 80, gym: "SmartFit" });
    expect(result.structuredContent.pendingChanges).toEqual({ weight_kg: 85, gym: "Iron Paradise" });
    expect(result.content[0].text).toContain("preview");
  });

  it("omits pendingChanges when preview is empty object", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { name: "Franco" } }],
    });

    const result = await toolHandlers["show_profile"]({ preview: {} });
    expect(result.structuredContent.pendingChanges).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
  });
});

describe("show_programs display tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetProgramDaysWithExercises.mockReset();
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_programs",
      expect.objectContaining({
        title: "My Programs",
        annotations: { readOnlyHint: true },
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/programs-list.html" } }),
      }),
      expect.any(Function)
    );
  });

  it("returns programs with full days", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL", is_active: true, description: "Push Pull Legs", version_id: 10, version_number: 2 }] });

    mockGetProgramDaysWithExercises
      .mockResolvedValueOnce([
        { day_label: "Push A", weekdays: [1], exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: 8 }] },
      ]);

    const result = await toolHandlers["show_programs"]();

    expect(result.structuredContent.mode).toBe("user");
    expect(result.structuredContent.programs).toHaveLength(1);
    expect(result.structuredContent.programs[0].name).toBe("PPL");
    expect(result.structuredContent.programs[0].description).toBe("Push Pull Legs");
    expect(result.structuredContent.programs[0].version).toBe(2);
    expect(result.structuredContent.programs[0].days).toHaveLength(1);
    expect(result.structuredContent.programs[0].days[0].exercises).toHaveLength(1);
    expect(result.structuredContent.exerciseCatalog).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
    expect(mockGetProgramDaysWithExercises).toHaveBeenCalledWith(10);
  });

  it("returns empty programs when user has none", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_programs"]();

    expect(result.structuredContent.programs).toHaveLength(0);
    expect(result.structuredContent.exerciseCatalog).toBeUndefined();
  });
});

describe("show_available_programs display tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetProgramDaysWithExercises.mockReset();
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
  });

  it("registers with correct name and config", () => {
    const server = {} as unknown as McpServer;
    registerDisplayTools(server);
    expect(registerAppToolWithMeta).toHaveBeenCalledWith(
      server,
      "show_available_programs",
      expect.objectContaining({
        title: "Available Programs",
        annotations: { readOnlyHint: true },
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/programs-list.html" } }),
      }),
      expect.any(Function)
    );
  });

  it("returns profile, globalPrograms, and clonedNames", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { name: "Franco", experience_level: "intermediate" } }] })
      .mockResolvedValueOnce({ rows: [{ name: "PPL" }] })
      .mockResolvedValueOnce({ rows: [{ id: 100, name: "Full Body 3x", description: "3 days/week", version_id: 50, version_number: 1 }] });

    mockGetProgramDaysWithExercises
      .mockResolvedValueOnce([
        { day_label: "Full Body A", weekdays: [1], exercises: [{ exercise_name: "Squat", target_sets: 3, target_reps: 8 }] },
        { day_label: "Full Body B", weekdays: [3], exercises: [{ exercise_name: "Deadlift", target_sets: 3, target_reps: 5 }] },
        { day_label: "Full Body C", weekdays: [5], exercises: [{ exercise_name: "Bench Press", target_sets: 3, target_reps: 10 }] },
      ]);

    const result = await toolHandlers["show_available_programs"]({});

    expect(result.structuredContent.mode).toBe("available");
    expect(result.structuredContent.profile).toEqual({ name: "Franco", experience_level: "intermediate" });
    expect(result.structuredContent.programs).toHaveLength(1);
    expect(result.structuredContent.programs[0].name).toBe("Full Body 3x");
    expect(result.structuredContent.programs[0].days_per_week).toBe(3);
    expect(result.structuredContent.programs[0].days).toHaveLength(3);
    expect(result.structuredContent.clonedNames).toEqual([]);
    expect(result.content[0].text).toContain("Do NOT describe");
    expect(mockGetProgramDaysWithExercises).toHaveBeenCalledWith(50);
  });

  it("includes clonedNames when user program matches global program name", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: {} }] })
      .mockResolvedValueOnce({ rows: [{ name: "Full Body 3x" }] })
      .mockResolvedValueOnce({ rows: [{ id: 100, name: "Full Body 3x", description: "3 days/week", version_id: 50, version_number: 1 }] });

    mockGetProgramDaysWithExercises
      .mockResolvedValueOnce([{ day_label: "Day A", weekdays: [1], exercises: [] }]);

    const result = await toolHandlers["show_available_programs"]({});

    expect(result.structuredContent.clonedNames).toEqual(["Full Body 3x"]);
  });

  it("filters global programs when filter param is provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { id: 100, name: "Full Body 3x", description: "3 days", version_id: 50, version_number: 1 },
        { id: 101, name: "PPL 6x", description: "6 days", version_id: 51, version_number: 1 },
      ] });

    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Day A", weekdays: [1], exercises: [] },
    ]);

    const result = await toolHandlers["show_available_programs"]({ filter: ["Full Body 3x"] });

    expect(result.structuredContent.programs).toHaveLength(1);
    expect(result.structuredContent.programs[0].name).toBe("Full Body 3x");
  });

  it("returns empty programs when none exist", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await toolHandlers["show_available_programs"]({});

    expect(result.structuredContent.profile).toEqual({});
    expect(result.structuredContent.programs).toHaveLength(0);
    expect(result.structuredContent.clonedNames).toEqual([]);
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
        annotations: { readOnlyHint: false },
        inputSchema: expect.objectContaining({ pending_changes: expect.anything() }),
        _meta: expect.objectContaining({ ui: { resourceUri: "ui://gym-tracker/programs.html" } }),
      }),
      expect.any(Function)
    );
  });

  it("returns active program with id, days, exercises, and initialDayIdx", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", description: "Push Pull Legs",
      version_id: 10, version_number: 2,
    });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: 8 }] },
      { day_label: "Pull", exercises: [{ exercise_name: "Barbell Row", target_sets: 4, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({});

    expect(result.structuredContent.program.id).toBe(1);
    expect(result.structuredContent.program.name).toBe("PPL");
    expect(result.structuredContent.program.version).toBe(2);
    expect(result.structuredContent.program.days).toHaveLength(2);
    expect(result.structuredContent.initialDayIdx).toBe(0);
    expect(result.structuredContent.exerciseCatalog).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
  });

  it("returns null program when none found", async () => {
    mockGetActiveProgram.mockResolvedValueOnce(null);

    const result = await toolHandlers["show_program"]({});

    expect(result.structuredContent.program).toBeNull();
    expect(result.content[0].text).toContain("No program found");
  });

  it("looks up program by name when provided", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 2, name: "Full Body", description: null, version_id: 5, version_number: 1 }],
      });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Day A", exercises: [{ exercise_name: "Squat", target_sets: 3, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({ name: "Full Body" });

    expect(result.structuredContent.program.id).toBe(2);
    expect(result.structuredContent.program.name).toBe("Full Body");
    expect(result.structuredContent.program.days).toHaveLength(1);
    expect(result.structuredContent.exerciseCatalog).toBeUndefined();
  });

  it("includes pendingChanges when pending_changes provided", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", description: "Push Pull Legs",
      version_id: 10, version_number: 2,
    });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({
      pending_changes: { name: "PPL v2", description: "Updated split" },
    });

    expect(result.structuredContent.pendingChanges).toEqual({ name: "PPL v2", description: "Updated split" });
    expect(result.content[0].text).toContain("proposed changes");
  });

  it("omits pendingChanges when pending_changes is empty object", async () => {
    mockGetActiveProgram.mockResolvedValueOnce({
      id: 1, name: "PPL", description: "Push Pull Legs",
      version_id: 10, version_number: 2,
    });
    mockGetProgramDaysWithExercises.mockResolvedValueOnce([
      { day_label: "Push", exercises: [{ exercise_name: "Bench Press", target_sets: 4, target_reps: 8 }] },
    ]);

    const result = await toolHandlers["show_program"]({ pending_changes: {} });

    expect(result.structuredContent.pendingChanges).toBeUndefined();
    expect(result.content[0].text).toContain("Do NOT describe");
  });
});
