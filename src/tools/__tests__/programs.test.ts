import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery, mockClientQuery, mockClient, mockInsertGroup, mockCloneGroups } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClient = { query: mockClientQuery, release: vi.fn() };
  let groupIdCounter = 100;
  return {
    mockQuery: vi.fn(),
    mockClientQuery,
    mockClient,
    mockInsertGroup: vi.fn().mockImplementation(() => Promise.resolve(groupIdCounter++)),
    mockCloneGroups: vi.fn().mockResolvedValue(new Map()),
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
  resolveExercisesBatch: vi.fn().mockImplementation((names: string[]) => {
    const map = new Map();
    for (const name of names) {
      map.set(name.trim().toLowerCase(), { id: 1, name: "Bench Press", isNew: false });
    }
    return Promise.resolve(map);
  }),
}));

vi.mock("../../helpers/program-helpers.js", () => ({
  getActiveProgram: vi.fn(),
  getLatestVersion: vi.fn(),
  getProgramDaysWithExercises: vi.fn(),
  cloneVersion: vi.fn(),
}));

vi.mock("../../helpers/group-helpers.js", () => ({
  insertGroup: mockInsertGroup,
  cloneGroups: mockCloneGroups,
  cloneGroupsBatch: mockCloneGroups,
}));

vi.mock("../../helpers/section-helpers.js", () => ({
  insertSection: vi.fn().mockResolvedValue(1),
  cloneSections: vi.fn().mockResolvedValue(new Map()),
  cloneSectionsBatch: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProgramTool } from "../programs.js";
import { getActiveProgram, getLatestVersion, getProgramDaysWithExercises } from "../../helpers/program-helpers.js";
import { resolveExercise, resolveExercisesBatch } from "../../helpers/exercise-resolver.js";

const mockGetActiveProgram = getActiveProgram as ReturnType<typeof vi.fn>;
const mockGetLatestVersion = getLatestVersion as ReturnType<typeof vi.fn>;
const mockGetDays = getProgramDaysWithExercises as ReturnType<typeof vi.fn>;
const mockResolveExercise = resolveExercise as ReturnType<typeof vi.fn>;
const mockResolveExercisesBatch = resolveExercisesBatch as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("manage_program tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClient.release.mockReset();
    mockGetActiveProgram.mockReset();
    mockGetLatestVersion.mockReset();
    mockGetDays.mockReset();
    mockResolveExercise.mockReset();
    mockResolveExercise.mockResolvedValue({ id: 1, name: "Bench Press", isNew: false });
    mockResolveExercisesBatch.mockReset();
    mockResolveExercisesBatch.mockImplementation((names: string[]) => {
      const map = new Map();
      for (const name of names) {
        map.set(name.trim().toLowerCase(), { id: 1, name: "Bench Press", isNew: false });
      }
      return Promise.resolve(map);
    });
    mockInsertGroup.mockReset();
    let gid = 100;
    mockInsertGroup.mockImplementation(() => Promise.resolve(gid++));
    mockCloneGroups.mockReset();
    mockCloneGroups.mockResolvedValue(new Map());

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
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
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate programs
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

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
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate programs
        .mockRejectedValueOnce(new Error("DB error")); // INSERT program fails

      const result = await toolHandler({
        action: "create", name: "PPL",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench", sets: 3, reps: 10 }] }],
      });

      expect(result.isError).toBe(true);
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
      // Batch delete now uses pool.query directly (no transaction)
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "PPL" }, { name: "Upper/Lower" }] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: ["PPL", "Upper/Lower"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deactivated).toEqual(["PPL", "Upper/Lower"]);
    });

    it("hard-deletes multiple programs", async () => {
      // Batch delete now uses pool.query directly (no transaction)
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "PPL" }] });

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
      // Batch delete now uses pool.query directly (no transaction)
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
        { id: 10, day_label: "Full Body A", weekdays: [1], exercises: [
          { exercise_id: 12, exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, group_id: null, group_type: null, rest_seconds: 120, notes: null },
          { exercise_id: 1, exercise_name: "Bench Press", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, group_id: null, group_type: null, rest_seconds: 90, notes: null },
        ]},
        { id: 11, day_label: "Full Body B", weekdays: [3], exercises: [
          { exercise_id: 17, exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, group_id: null, group_type: null, rest_seconds: 180, notes: null },
        ]},
      ]);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
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
        { id: 10, day_label: "Day A", weekdays: [1], exercises: [
          { exercise_id: 12, exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, group_id: null, group_type: null, rest_seconds: 120, notes: null },
        ]},
      ]);

      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
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

    it("patches days (creates new version)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] }); // find by program_id
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
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
        .mockRejectedValueOnce(new Error("DB error")); // INSERT version fails

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench", sets: 3, reps: 10 }] }],
      });

      expect(result.isError).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
    });

    // --- Nullable fields (widget sends null) ---

    it("stores null for all nullable exercise fields", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [{
            exercise: "Bench Press", sets: 3, reps: 10,
            weight: null, rpe: null, rest_seconds: null, notes: null,
          }],
        }],
      });

      // INSERT exercise is the 4th call (index 3)
      const insertArgs = mockClientQuery.mock.calls[3][1];
      expect(insertArgs[4]).toBeNull(); // weight
      expect(insertArgs[5]).toBeNull(); // rpe
      expect(insertArgs[7]).toBeNull(); // group_id (solo exercise)
      expect(insertArgs[8]).toBeNull(); // rest_seconds
      expect(insertArgs[9]).toBeNull(); // notes
    });

    it("stores null for weekdays: null on days", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push", weekdays: null,
          exercises: [{ exercise: "Bench Press", sets: 3, reps: 10 }],
        }],
      });

      // INSERT day is the 3rd call (index 2)
      const dayArgs = mockClientQuery.mock.calls[2][1];
      expect(dayArgs[2]).toBeNull(); // weekdays
    });

    it("handles mixed null and non-null values across exercises", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "Lateral Raise", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise 1
        .mockResolvedValueOnce({}) // INSERT exercise 2
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [
            { exercise: "Bench Press", sets: 4, reps: 8, weight: 80, rpe: null, rest_seconds: 120, notes: null },
            { exercise: "Lateral Raise", sets: 3, reps: 12, weight: null, rpe: 8, rest_seconds: null, notes: "slow eccentric" },
          ],
        }],
      });

      // Exercise 1 (index 3)
      const ex1Args = mockClientQuery.mock.calls[3][1];
      expect(ex1Args[4]).toBe(80);   // weight
      expect(ex1Args[5]).toBeNull();  // rpe (null)
      expect(ex1Args[8]).toBe(120);   // rest_seconds
      expect(ex1Args[9]).toBeNull(); // notes (null)

      // Exercise 2 (index 4)
      const ex2Args = mockClientQuery.mock.calls[4][1];
      expect(ex2Args[4]).toBeNull();            // weight (null)
      expect(ex2Args[5]).toBe(8);               // rpe
      expect(ex2Args[8]).toBeNull();            // rest_seconds (null)
      expect(ex2Args[9]).toBe("slow eccentric"); // notes
    });

    // --- Metadata updates ---

    it("updates name only (no days, no description)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1, new_name: "Push Pull Legs",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("Push Pull Legs");
      expect(parsed.days_count).toBeUndefined();

      // Only BEGIN, UPDATE name, COMMIT — no description UPDATE
      expect(mockClientQuery).toHaveBeenCalledTimes(3);
    });

    it("updates description only", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE description
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1, description: "A new description",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.description).toBe("A new description");
    });

    it("updates both name and description together", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
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
      expect(parsed.program.name).toBe("New PPL");
      expect(parsed.program.description).toBe("Updated desc");
      expect(mockClientQuery).toHaveBeenCalledTimes(4);
    });

    it("clears description with empty string (stores as null)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE description
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1, description: "",
      });
      const parsed = JSON.parse(result.content[0].text);
      // description || null → "" || null → null
      expect(parsed.program.description).toBeNull();

      // Verify UPDATE query received null
      const descUpdateArgs = mockClientQuery.mock.calls[1][1];
      expect(descUpdateArgs[0]).toBeNull();
    });

    it("skips description update when undefined (not provided)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1, new_name: "New PPL",
        // description not provided → undefined
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("New PPL");
      // description should not appear in response (undefined is omitted in JSON)
      expect(parsed.program.description).toBeUndefined();
      // Only 3 calls: BEGIN, UPDATE name, COMMIT
      expect(mockClientQuery).toHaveBeenCalledTimes(3);
    });

    // --- Day operations ---

    it("replaces multiple days with exercises", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "Squat", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // INSERT exercise 1
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2
        .mockResolvedValueOnce({}) // INSERT exercise 2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [
          { day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 4, reps: 8 }] },
          { day_label: "Legs", exercises: [{ exercise: "Squat", sets: 5, reps: 5 }] },
        ],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.days_count).toBe(2);
      expect(parsed.exercises_count).toBe(2);
    });

    it("sends empty exercises array for a day (day created, 0 exercises)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day (no exercises)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [{ day_label: "Rest Day", exercises: [] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.days_count).toBe(1);
      // exercisesCount is 0, and the response uses `exercisesCount || undefined` which yields undefined for 0
      expect(parsed.exercises_count).toBeUndefined();
    });

    it("patches with multiple days each having multiple exercises", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "Incline DB", isNew: false })
        .mockResolvedValueOnce({ id: 3, name: "Squat", isNew: false })
        .mockResolvedValueOnce({ id: 4, name: "Leg Press", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // INSERT ex 1
        .mockResolvedValueOnce({}) // INSERT ex 2
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2
        .mockResolvedValueOnce({}) // INSERT ex 3
        .mockResolvedValueOnce({}) // INSERT ex 4
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [
          { day_label: "Push", exercises: [
            { exercise: "Bench Press", sets: 4, reps: 8 },
            { exercise: "Incline DB", sets: 3, reps: 10 },
          ]},
          { day_label: "Legs", exercises: [
            { exercise: "Squat", sets: 5, reps: 5 },
            { exercise: "Leg Press", sets: 3, reps: 12 },
          ]},
        ],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.days_count).toBe(2);
      expect(parsed.exercises_count).toBe(4);
    });

    it("preserves day ordering via sort_order", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "A", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "B", isNew: false })
        .mockResolvedValueOnce({ id: 3, name: "C", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 0
        .mockResolvedValueOnce({}) // INSERT ex
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 1
        .mockResolvedValueOnce({}) // INSERT ex
        .mockResolvedValueOnce({ rows: [{ id: 22 }] }) // INSERT day 2
        .mockResolvedValueOnce({}) // INSERT ex
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [
          { day_label: "Push", exercises: [{ exercise: "A", sets: 3, reps: 10 }] },
          { day_label: "Pull", exercises: [{ exercise: "B", sets: 3, reps: 10 }] },
          { day_label: "Legs", exercises: [{ exercise: "C", sets: 3, reps: 10 }] },
        ],
      });

      // Day inserts at indices 2, 4, 6 (after BEGIN, DELETE)
      expect(mockClientQuery.mock.calls[2][1][3]).toBe(0); // sort_order for day 0
      expect(mockClientQuery.mock.calls[4][1][3]).toBe(1); // sort_order for day 1
      expect(mockClientQuery.mock.calls[6][1][3]).toBe(2); // sort_order for day 2
    });

    it("handles weekdays: null vs weekdays: [1,3,5]", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "A", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "B", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day 1 (weekdays null)
        .mockResolvedValueOnce({}) // INSERT ex
        .mockResolvedValueOnce({ rows: [{ id: 21 }] }) // INSERT day 2 (weekdays [1,3,5])
        .mockResolvedValueOnce({}) // INSERT ex
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [
          { day_label: "Day A", weekdays: null, exercises: [{ exercise: "A", sets: 3, reps: 10 }] },
          { day_label: "Day B", weekdays: [1, 3, 5], exercises: [{ exercise: "B", sets: 3, reps: 10 }] },
        ],
      });

      // Day 1 weekdays (index 2, param index 2)
      expect(mockClientQuery.mock.calls[2][1][2]).toBeNull();
      // Day 2 weekdays (index 4, param index 2)
      expect(mockClientQuery.mock.calls[4][1][2]).toEqual([1, 3, 5]);
    });

    // --- Exercise operations ---

    it("stores all optional exercise fields when populated (solo exercise)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [{
            exercise: "Bench Press", sets: 4, reps: 8,
            weight: 100, rpe: 8, rest_seconds: 90, notes: "slow tempo",
          }],
        }],
      });

      const insertArgs = mockClientQuery.mock.calls[3][1];
      expect(insertArgs[4]).toBe(100);          // weight
      expect(insertArgs[5]).toBe(8);            // rpe
      expect(insertArgs[7]).toBeNull();         // group_id (solo)
      expect(insertArgs[8]).toBe(90);           // rest_seconds
      expect(insertArgs[9]).toBe("slow tempo"); // notes
    });

    it("passes transaction client to resolveExercisesBatch", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [{ exercise: "Bench Press", sets: 3, reps: 10 }],
        }],
      });

      // Batch resolution: called with all exercise names, user_id, and transaction client
      expect(mockResolveExercisesBatch).toHaveBeenCalledWith(
        ["Bench Press"], 1, mockClient
      );
    });

    // --- Group scenarios (nested format) ---

    it("creates a group with multiple exercises using nested format", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Cable Fly", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "Lateral Raise", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        // insertGroup is mocked (returns 100), then 2 INSERT exercises
        .mockResolvedValueOnce({}) // INSERT ex 1
        .mockResolvedValueOnce({}) // INSERT ex 2
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [{
            group_type: "superset",
            label: "Chest + Shoulders",
            rest_seconds: 90,
            exercises: [
              { exercise: "Cable Fly", sets: 3, reps: 12 },
              { exercise: "Lateral Raise", sets: 3, reps: 15 },
            ],
          }],
        }],
      });

      // insertGroup should have been called with superset type
      expect(mockInsertGroup).toHaveBeenCalledTimes(1);
      expect(mockInsertGroup.mock.calls[0][3].group_type).toBe("superset");
      expect(mockInsertGroup.mock.calls[0][3].label).toBe("Chest + Shoulders");

      // Both exercises should have the same group_id (100 from mock)
      const ex1Args = mockClientQuery.mock.calls[3][1];
      const ex2Args = mockClientQuery.mock.calls[4][1];
      expect(ex1Args[7]).toBe(100); // group_id
      expect(ex2Args[7]).toBe(100); // same group_id
      // Grouped exercises have null rest_seconds
      expect(ex1Args[8]).toBeNull();
      expect(ex2Args[8]).toBeNull();
    });

    it("handles mixed solo exercises and groups in same day", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false })
        .mockResolvedValueOnce({ id: 2, name: "A", isNew: false })
        .mockResolvedValueOnce({ id: 3, name: "B", isNew: false })
        .mockResolvedValueOnce({ id: 4, name: "Tricep Pushdown", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT solo ex (Bench)
        // insertGroup mocked (returns 100)
        .mockResolvedValueOnce({}) // INSERT grouped ex A
        .mockResolvedValueOnce({}) // INSERT grouped ex B
        .mockResolvedValueOnce({}) // INSERT solo ex (Tricep)
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1,
        days: [{
          day_label: "Push",
          exercises: [
            { exercise: "Bench Press", sets: 4, reps: 8, rest_seconds: 180 },
            {
              group_type: "superset",
              rest_seconds: 90,
              exercises: [
                { exercise: "A", sets: 3, reps: 12 },
                { exercise: "B", sets: 3, reps: 15 },
              ],
            },
            { exercise: "Tricep Pushdown", sets: 3, reps: 12, rest_seconds: 60 },
          ],
        }],
      });

      // Solo Bench: group_id null, rest_seconds 180
      const benchArgs = mockClientQuery.mock.calls[3][1];
      expect(benchArgs[7]).toBeNull();
      expect(benchArgs[8]).toBe(180);

      // Grouped exercises: group_id 100, rest_seconds null
      const exAArgs = mockClientQuery.mock.calls[4][1];
      const exBArgs = mockClientQuery.mock.calls[5][1];
      expect(exAArgs[7]).toBe(100);
      expect(exAArgs[8]).toBeNull();
      expect(exBArgs[7]).toBe(100);

      // Solo Tricep: group_id null, rest_seconds 60
      const tricepArgs = mockClientQuery.mock.calls[6][1];
      expect(tricepArgs[7]).toBeNull();
      expect(tricepArgs[8]).toBe(60);
    });

    // --- Combined operations (widget auto-save pattern) ---

    it("combines name + description + days in one patch (full widget save)", async () => {
      mockResolveExercise
        .mockResolvedValueOnce({ id: 1, name: "Bench Press", isNew: false });

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}) // UPDATE description
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        new_name: "My PPL", description: "Custom PPL",
        days: [{
          day_label: "Push",
          exercises: [{ exercise: "Bench Press", sets: 4, reps: 8, weight: 80 }],
        }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("My PPL");
      expect(parsed.program.description).toBe("Custom PPL");
      expect(parsed.days_count).toBe(1);
      expect(parsed.exercises_count).toBe(1);
      expect(mockClientQuery).toHaveBeenCalledTimes(7);
    });

    it("metadata-only patch when days is not provided", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1, new_name: "Better PPL",
        // days not provided at all
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("Better PPL");
      expect(parsed.days_count).toBeUndefined();
      expect(parsed.exercises_count).toBeUndefined();
    });

    // --- Error handling ---

    it("returns error when no version found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce(null); // no version

      const result = await toolHandler({ action: "patch", program_id: 1, new_name: "Test" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("No version found");
    });

    it("rolls back and releases client on exercise resolution error", async () => {
      mockResolveExercisesBatch.mockRejectedValueOnce(new Error("Exercise not found"));

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }); // INSERT day

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: [{ day_label: "Push", exercises: [{ exercise: "Unknown", sets: 3, reps: 10 }] }],
      });

      expect(result.isError).toBe(true);
      expect(mockClientQuery).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("always releases client in finally block", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE name
        .mockResolvedValueOnce({}); // COMMIT

      await toolHandler({
        action: "patch", program_id: 1, new_name: "Test",
      });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    // --- JSON string workaround ---

    it("handles days passed as JSON string", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "PPL" }] });
      mockGetLatestVersion.mockResolvedValueOnce({ id: 5, version_number: 2 });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "patch", program_id: 1,
        days: JSON.stringify([{
          day_label: "Push",
          exercises: [{ exercise: "Bench Press", sets: 3, reps: 10 }],
        }]),
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.days_count).toBe(1);
      expect(parsed.exercises_count).toBe(1);
    });
  });

  describe("per-set targets (array reps/weight)", () => {
    it("stores per-set reps array on create", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no duplicate
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT program
        .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // INSERT version
        .mockResolvedValueOnce({ rows: [{ id: 20 }] }) // INSERT day
        .mockResolvedValueOnce({}) // INSERT exercise
        .mockResolvedValueOnce({}); // COMMIT

      const result = await toolHandler({
        action: "create", name: "Pyramid",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 3, reps: [12, 10, 8] }] }],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.program.name).toBe("Pyramid");

      // INSERT exercise is the 7th call (index 6) after profile query was added
      const insertArgs = mockClientQuery.mock.calls[6][1];
      expect(insertArgs[3]).toBe(12); // target_reps = first element
      expect(insertArgs[11]).toEqual([12, 10, 8]); // target_reps_per_set
      expect(insertArgs[12]).toBeNull(); // target_weight_per_set (not provided)
    });

    it("stores per-set weight array on create", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 20 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await toolHandler({
        action: "create", name: "Pyramid",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 3, reps: [12, 10, 8], weight: [80, 85, 90] }] }],
      });

      const insertArgs = mockClientQuery.mock.calls[6][1];
      expect(insertArgs[3]).toBe(12); // target_reps = first
      expect(insertArgs[4]).toBe(80); // target_weight = first
      expect(insertArgs[11]).toEqual([12, 10, 8]); // target_reps_per_set
      expect(insertArgs[12]).toEqual([80, 85, 90]); // target_weight_per_set
    });

    it("stores null per-set arrays for uniform reps/weight", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 20 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await toolHandler({
        action: "create", name: "Uniform",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 3, reps: 10, weight: 80 }] }],
      });

      const insertArgs = mockClientQuery.mock.calls[6][1];
      expect(insertArgs[3]).toBe(10); // target_reps
      expect(insertArgs[4]).toBe(80); // target_weight
      expect(insertArgs[11]).toBeNull(); // target_reps_per_set
      expect(insertArgs[12]).toBeNull(); // target_weight_per_set
    });

    it("stores only weight array when reps is uniform", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ req_val: null }] }) // profile requires_validation
        .mockResolvedValueOnce({}) // deactivate
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 20 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await toolHandler({
        action: "create", name: "WeightOnly",
        days: [{ day_label: "Push", exercises: [{ exercise: "Bench Press", sets: 3, reps: 10, weight: [80, 85, 90] }] }],
      });

      const insertArgs = mockClientQuery.mock.calls[6][1];
      expect(insertArgs[3]).toBe(10); // target_reps (scalar)
      expect(insertArgs[4]).toBe(80); // target_weight = first of array
      expect(insertArgs[11]).toBeNull(); // target_reps_per_set (null, uniform)
      expect(insertArgs[12]).toEqual([80, 85, 90]); // target_weight_per_set
    });
  });

  it("returns error for unknown action", async () => {
    const result = await toolHandler({ action: "unknown" });
    expect(result.isError).toBe(true);
  });
});
