import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockClientQuery, mockClient } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClient = { query: mockClientQuery, release: vi.fn() };
  return {
    mockQuery: vi.fn(),
    mockClientQuery,
    mockClient,
  };
});

vi.mock("../../db/connection.js", () => ({
  default: {
    query: mockQuery,
    connect: vi.fn().mockResolvedValue(mockClient),
  },
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  resolveExercise: vi.fn().mockResolvedValue({ id: 1, name: "Bench Press", isNew: false }),
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: vi.fn(),
  getLatestVersion: vi.fn(),
  getProgramDaysWithExercises: vi.fn(),
  cloneVersion: vi.fn(),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProgramTool } from "../programs.js";
import { getActiveProgram, getLatestVersion, getProgramDaysWithExercises } from "../../helpers/program-helpers.js";

const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockGetLatestVersion = getLatestVersion as ReturnType<typeof vi.fn>;
const mockGetDays = getProgramDaysWithExercises as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("manage_program tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClient.release.mockReset();
    mockGetActiveProgram.mockReset();
    mockGetLatestVersion.mockReset();
    mockGetDays.mockReset();

    const server = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerProgramTool(server);
  });

  describe("list action", () => {
    it("returns all programs with active indicator", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, name: "PPL", description: "Push Pull Legs", is_active: true, current_version: 2, days_count: "3" },
          { id: 2, name: "Upper/Lower", description: null, is_active: false, current_version: 1, days_count: "2" },
        ],
      });

      const result = await toolHandler({ action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.active_program).toBe("PPL");
      expect(parsed.programs).toHaveLength(2);
    });

    it("returns null active_program when none active", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "PPL", is_active: false, current_version: 1, days_count: "3" }],
      });

      const result = await toolHandler({ action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.active_program).toBeNull();
    });
  });

  describe("get action", () => {
    it("gets program by name", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "PPL", description: "Push Pull Legs", version_id: 5, version_number: 2 }],
      });
      mockGetDays.mockResolvedValueOnce([{ id: 1, day_label: "Push", exercises: [] }]);

      const result = await toolHandler({ action: "get", name: "PPL" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("PPL");
      expect(parsed.program.version).toBe(2);
    });

    it("returns error when program not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({ action: "get", name: "NonExistent" });
      expect(result.isError).toBe(true);
    });
  });

  describe("create action", () => {
    it("rejects when name missing", async () => {
      const result = await toolHandler({ action: "create", days: [{ day_label: "Push", exercises: [] }] });
      expect(result.isError).toBe(true);
    });

    it("rejects duplicate program name", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await toolHandler({
        action: "create", name: "PPL",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 3, reps: 10 }] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("already exists");
    });

    it("creates program with days and exercises", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 20 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await toolHandler({
        action: "create", name: "PPL", description: "Push Pull Legs",
        days: [{ day_label: "Push", weekdays: [1, 4], exercises: [{ exercise: "Bench Press", sets: 4, reps: 8, weight: 80 }] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("PPL");
      expect(parsed.days_created).toBe(1);
    });

    it("rolls back on error during creation", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("DB error"));

      await expect(toolHandler({
        action: "create", name: "PPL",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench", sets: 3, reps: 10 }] }],
      })).rejects.toThrow("DB error");

      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("update action", () => {
    it("updates metadata only when no days provided", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // find program
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "New PPL", description: "Updated desc" }] }); // UPDATE

      const result = await toolHandler({
        action: "update", name: "PPL", new_name: "New PPL", description: "Updated desc",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated.name).toBe("New PPL");
      expect(parsed.updated.description).toBe("Updated desc");

      // Verify the UPDATE query includes user_id in WHERE clause
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("user_id");
    });

    it("rejects metadata update with no fields", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // find program

      const result = await toolHandler({ action: "update", name: "PPL" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Provide days array");
    });

    it("creates new version when days provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // find program
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 6 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "update", name: "PPL", change_description: "Added leg day",
        days: [{ day_label: "Legs", exercises: [{ exercise: "Squat", sets: 5, reps: 5 }] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.version).toBe(3);
      expect(parsed.exercises_summary).toBeDefined();
    });
  });

  describe("activate action", () => {
    it("activates a program by name", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 2, name: "Upper/Lower" }] })
        .mockResolvedValueOnce({});

      const result = await toolHandler({ action: "activate", name: "Upper/Lower" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.activated).toBe("Upper/Lower");
    });

    it("rejects when name not provided", async () => {
      const result = await toolHandler({ action: "activate" });
      expect(result.isError).toBe(true);
    });

    it("rejects when program not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await toolHandler({ action: "activate", name: "NonExistent" });
      expect(result.isError).toBe(true);
    });
  });

  describe("delete action", () => {
    it("deactivates a program (soft delete)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "PPL" }] });

      const result = await toolHandler({ action: "delete", name: "PPL" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deactivated).toBe("PPL");
    });

    it("rejects when name not provided", async () => {
      const result = await toolHandler({ action: "delete" });
      expect(result.isError).toBe(true);
    });
  });

  describe("delete_bulk action", () => {
    it("rejects without names array", async () => {
      const result = await toolHandler({ action: "delete_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("names array required");
    });

    it("soft-deletes multiple programs", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: "PPL" }] })
        .mockResolvedValueOnce({ rows: [{ name: "Upper/Lower" }] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: ["PPL", "Upper/Lower"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deactivated).toEqual(["PPL", "Upper/Lower"]);
    });

    it("hard-deletes multiple programs", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: "PPL" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: ["PPL", "NonExistent"],
        hard_delete: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["PPL"]);
      expect(parsed.not_found).toEqual(["NonExistent"]);
    });

    it("handles JSON string workaround for names", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "PPL" }] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: JSON.stringify(["PPL"]),
        hard_delete: true,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["PPL"]);
    });
  });

  describe("history action", () => {
    it("returns version history for a program", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] })
        .mockResolvedValueOnce({
          rows: [
            { version_number: 3, change_description: "Added lateral raises", created_at: "2024-03-01" },
            { version_number: 2, change_description: "Swapped flies for cables", created_at: "2024-02-01" },
            { version_number: 1, change_description: "Initial version", created_at: "2024-01-01" },
          ],
        });

      const result = await toolHandler({ action: "history", name: "PPL" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program).toBe("PPL");
      expect(parsed.versions).toHaveLength(3);
    });
  });

  describe("list_templates action", () => {
    it("returns all available templates", async () => {
      const result = await toolHandler({ action: "list_templates" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.templates).toHaveLength(3);
      expect(parsed.templates.map((t: any) => t.id)).toEqual(
        expect.arrayContaining(["full_body_3x", "upper_lower_4x", "ppl_6x"])
      );
      expect(parsed.templates[0]).toHaveProperty("name");
      expect(parsed.templates[0]).toHaveProperty("days_per_week");
      expect(parsed.templates[0]).toHaveProperty("description");
      expect(parsed.templates[0]).toHaveProperty("target_experience");
    });
  });

  describe("create_from_template action", () => {
    it("rejects when template_id is missing", async () => {
      const result = await toolHandler({ action: "create_from_template" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("template_id is required");
    });

    it("rejects invalid template_id", async () => {
      const result = await toolHandler({ action: "create_from_template", template_id: "nonexistent" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("not found");
    });

    it("rejects duplicate program name", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // program exists

      const result = await toolHandler({ action: "create_from_template", template_id: "full_body_3x" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("already exists");
    });

    it("creates program from template with default name", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing program
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // deactivate others
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        // 3 days × exercises (day1: 5ex, day2: 5ex, day3: 5ex = 15 exercises)
        // For each day: INSERT day + INSERT exercises
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}) // ex 2
        .mockResolvedValueOnce({}) // ex 3
        .mockResolvedValueOnce({}) // ex 4
        .mockResolvedValueOnce({}) // ex 5
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}) // ex 2
        .mockResolvedValueOnce({}) // ex 3
        .mockResolvedValueOnce({}) // ex 4
        .mockResolvedValueOnce({}) // ex 5
        .mockResolvedValueOnce({ rows: [{ id: 22 }] }) // INSERT day 3
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}) // ex 2
        .mockResolvedValueOnce({}) // ex 3
        .mockResolvedValueOnce({}) // ex 4
        .mockResolvedValueOnce({}) // ex 5
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "create_from_template", template_id: "full_body_3x" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("Full Body 3x");
      expect(parsed.program.template).toBe("full_body_3x");
      expect(parsed.days_created).toBe(3);
    });

    it("allows custom name override", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing program
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // deactivate others
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}) // 5 ex
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2
        .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}) // 5 ex
        .mockResolvedValueOnce({ rows: [{ id: 22 }] }) // INSERT day 3
        .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({}) // 5 ex
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "create_from_template", template_id: "full_body_3x", name: "My Routine" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("My Routine");
    });
  });

  it("returns error for unknown action", async () => {
    const result = await toolHandler({ action: "unknown" });
    expect(result.isError).toBe(true);
  });
});
