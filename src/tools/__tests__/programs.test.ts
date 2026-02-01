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

  describe("clone action", () => {
    it("rejects when source_id is missing", async () => {
      const result = await toolHandler({ action: "clone" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("source_id is required");
    });

    it("rejects when source program not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // source not found

      const result = await toolHandler({ action: "clone", source_id: 999 });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("not found");
    });

    it("rejects duplicate program name", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 100, name: "Full Body 3x", description: "3 days", version_id: 50 }] }) // source found
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // duplicate name

      const result = await toolHandler({ action: "clone", source_id: 100 });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("already exists");
    });

    it("clones a global program with default name", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 100, name: "Full Body 3x", description: "3 days/week full body", version_id: 50 }] }) // source
        .mockResolvedValueOnce({ rows: [] }); // no duplicate

      mockGetDays.mockResolvedValueOnce([
        { day_label: "Full Body A", weekdays: [1], exercises: [
          { exercise_id: 12, exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null },
          { exercise_id: 1, exercise_name: "Bench Press", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null },
        ]},
        { day_label: "Full Body B", weekdays: [3], exercises: [
          { exercise_id: 17, exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null },
        ]},
      ]);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // deactivate others
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}) // ex 2
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "clone", source_id: 100 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("Full Body 3x");
      expect(parsed.program.source).toBe("Full Body 3x");
      expect(parsed.days_created).toBe(2);
      expect(parsed.total_exercises).toBe(3);
    });

    it("allows custom name override", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 100, name: "Full Body 3x", description: "3 days", version_id: 50 }] })
        .mockResolvedValueOnce({ rows: [] }); // no duplicate

      mockGetDays.mockResolvedValueOnce([
        { day_label: "Day A", weekdays: [1], exercises: [
          { exercise_id: 12, exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null },
        ]},
      ]);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // deactivate others
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // ex 1
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({ action: "clone", source_id: 100, name: "My Routine" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("My Routine");
    });
  });

  describe("patch action", () => {
    it("patches metadata only (no days)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] }); // find by program_id
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}) // UPDATE description
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        new_name: "New PPL", description: "Updated desc",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.id).toBe(1);
      expect(parsed.program.name).toBe("New PPL");
      expect(parsed.program.version).toBe(2);
    });

    it("patches days (deletes and re-inserts)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] }); // find by program_id
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DELETE program_days
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [{ day_label: "Push", weekdays: [1], exercises: [{ exercise: "Bench Press", sets: 4, reps: 8 }] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.id).toBe(1);
      expect(parsed.days_count).toBe(1);
      expect(parsed.exercises_count).toBe(1);
    });

    it("finds program by name when program_id not provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, name: "Upper/Lower" }] }); // find by name
      mockGetLatestVersion.mockResolvedValueOnce({ id: 8, version_number: 1 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", name: "Upper/Lower", new_name: "UL Split",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("UL Split");
    });

    it("falls back to active program", async () => {
      mockGetActiveProgram.mockResolvedValueOnce({ id: 3, name: "Active Prog" });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 10, version_number: 1 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE description
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", description: "New desc",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.id).toBe(3);
    });

    it("returns error when program not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // not found

      const result = await toolHandler({ action: "patch", program_id: 999 });
      expect(result.isError).toBe(true);
    });

    it("rolls back on error", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("DB error")); // DELETE fails

      await expect(toolHandler({
        action: "patch", program_id: 1,
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench", sets: 3, reps: 10 }] }],
      })).rejects.toThrow("DB error");

      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  it("returns error for unknown action", async () => {
    const result = await toolHandler({ action: "unknown" });
    expect(result.isError).toBe(true);
  });
});
