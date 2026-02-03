import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  findExercise: vi.fn().mockResolvedValue({ id: 1, name: "Bench Press", isNew: false }),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

vi.mock("../../helpers/date-helpers.js", () => ({
  getUserCurrentDate: vi.fn().mockResolvedValue("2024-01-15"),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEditLogTool } from "../edit-log.js";

let toolHandler: Function;

describe("edit_workout tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();

    const server = {
      registerTool: vi.fn((_name: string, _config: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerEditLogTool(server);
  });

  describe("update action", () => {
    it("updates weight on all sets", async () => {
      mockQuery
        // Find session_exercises
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        // Total sets count
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        // Update query
        .mockResolvedValueOnce({ rowCount: 3 })
        // Fetch updated sets
        .mockResolvedValueOnce({
          rows: [
            { set_id: 1, set_number: 1, reps: 8, weight: 85, rpe: null, set_type: "working", notes: null },
            { set_id: 2, set_number: 2, reps: 8, weight: 85, rpe: null, set_type: "working", notes: null },
            { set_id: 3, set_number: 3, reps: 8, weight: 85, rpe: null, set_type: "working", notes: null },
          ],
        });

      const result = await toolHandler({
        exercise: "Bench Press", workout: "today", action: "update", updates: { weight: 85 },
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sets_updated).toBe(3);
      expect(parsed.updated_sets).toHaveLength(3);
      expect(parsed.session_id).toBe(5);
      expect(parsed.workout_date).toBe("2024-01-15");
      expect(parsed.total_sets).toBe(3);
    });

    it("updates specific set numbers only", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { set_id: 1, set_number: 1, reps: 8, weight: 80, rpe: null, set_type: "working", notes: null },
            { set_id: 2, set_number: 2, reps: 10, weight: 80, rpe: null, set_type: "working", notes: null },
          ],
        });

      const result = await toolHandler({
        exercise: "Bench Press", action: "update", updates: { reps: 10 }, set_numbers: [2],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sets_updated).toBe(1);
    });

    it("rejects update with no updates object", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] });

      const result = await toolHandler({ exercise: "Bench Press", action: "update" });
      expect(result.isError).toBe(true);
    });
  });

  describe("delete action", () => {
    it("deletes specific sets", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // remaining sets check
        .mockResolvedValueOnce({ rows: [{ set_id: 1, set_number: 1, reps: 8, weight: 80 }, { set_id: 2, set_number: 2, reps: 8, weight: 80 }] }); // remaining sets

      const result = await toolHandler({
        exercise: "Bench Press", action: "delete", set_numbers: [3],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
      expect(parsed.set_numbers).toEqual([3]);
      expect(parsed.sets_deleted).toBe(1);
      expect(parsed.sets_remaining).toBe(2);
    });

    it("deletes all sets and session_exercise when no set_numbers", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({ rowCount: 3 }) // DELETE sets
        .mockResolvedValueOnce({}) // DELETE session_exercise
        .mockResolvedValueOnce({ rows: [] }); // remaining sets (none)

      const result = await toolHandler({ exercise: "Bench Press", action: "delete" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toBe(true);
      expect(parsed.scope).toBe("all");
      expect(parsed.sets_deleted).toBe(3);
      expect(parsed.sets_remaining).toBe(0);
    });
  });

  describe("restore_workout", () => {
    it("includes user_id in UPDATE query", async () => {
      mockQuery
        // resolveWorkoutSelector query (with includeDeleted)
        .mockResolvedValueOnce({ rows: [{ session_id: 1, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: new Date("2024-01-16") }] })
        // UPDATE to restore
        .mockResolvedValueOnce({});

      await toolHandler({ restore_workout: 1 });

      // The UPDATE query should include AND user_id = $2
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("user_id");
      expect(updateCall[1]).toContain(1); // userId
    });
  });

  describe("delete_workout", () => {
    it("includes user_id in UPDATE query", async () => {
      mockQuery
        // resolveWorkoutSelector query
        .mockResolvedValueOnce({ rows: [{ session_id: 1, started_at: new Date("2024-01-15"), is_validated: true, deleted_at: null }] })
        // COUNT exercises
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        // UPDATE to delete
        .mockResolvedValueOnce({});

      await toolHandler({ delete_workout: 1 });

      // The UPDATE query should include AND user_id = $2
      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain("user_id");
      expect(updateCall[1]).toContain(1); // userId
    });

    it("accepts semantic selectors like 'today'", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: true, deleted_at: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({});

      const result = await toolHandler({ delete_workout: "today" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.deleted_workout).toBe(42);
      expect(parsed.workout_date).toBe("2024-01-15");
      expect(parsed.exercises_count).toBe(2);
    });

    it("accepts 'yesterday' selector", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ session_id: 41, started_at: new Date("2024-01-14"), is_validated: true, deleted_at: null }] })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] })
        .mockResolvedValueOnce({});

      const result = await toolHandler({ delete_workout: "yesterday" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.deleted_workout).toBe(41);
      expect(parsed.workout_date).toBe("2024-01-14");
    });
  });

  describe("delete_workouts bulk", () => {
    it("rejects without workout IDs array", async () => {
      const result = await toolHandler({ delete_workouts: "[]" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("array of workout IDs");
    });

    it("soft-deletes multiple workouts and reports not_found", async () => {
      // Single batch query returns the IDs that were actually deleted with started_at
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, started_at: new Date("2024-01-10") },
          { id: 3, started_at: new Date("2024-01-12") },
        ],
      });

      const result = await toolHandler({ delete_workouts: [1, 2, 3] });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.deleted).toEqual([
        { session_id: 1, workout_date: "2024-01-10" },
        { session_id: 3, workout_date: "2024-01-12" },
      ]);
      expect(parsed.not_found).toEqual([2]);
    });

    it("handles JSON string workaround for delete_workouts", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 5, started_at: new Date("2024-01-15") }] });

      const result = await toolHandler({ delete_workouts: JSON.stringify([5]) });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual([{ session_id: 5, workout_date: "2024-01-15" }]);
    });
  });

  describe("validate_workout", () => {
    it("accepts semantic selectors like 'today'", async () => {
      mockQuery
        // resolveWorkoutSelector
        .mockResolvedValueOnce({ rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: null }] })
        // UPDATE is_validated
        .mockResolvedValueOnce({})
        // Get exercises
        .mockResolvedValueOnce({ rows: [] })
        // Batch get all sets (none since no exercises)
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({ validate_workout: "today" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.validated).toBe(true);
      expect(parsed.session_id).toBe(42);
      expect(parsed.workout_date).toBe("2024-01-15");
    });

    it("returns already validated message", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: true, deleted_at: null }],
      });

      const result = await toolHandler({ validate_workout: "today" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.message).toBe("Workout is already validated");
      expect(parsed.session_id).toBe(42);
    });
  });

  describe("update_session", () => {
    it("updates session notes", async () => {
      mockQuery
        // resolveWorkoutSelector
        .mockResolvedValueOnce({ rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: null }] })
        // UPDATE session
        .mockResolvedValueOnce({
          rows: [{ id: 42, notes: "Great workout!", tags: ["legs"], started_at: new Date("2024-01-15") }],
        });

      const result = await toolHandler({
        update_session: { notes: "Great workout!" },
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.updated_session).toBe(true);
      expect(parsed.session_id).toBe(42);
      expect(parsed.notes).toBe("Great workout!");
    });

    it("adds tags to session", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: null }] })
        .mockResolvedValueOnce({
          rows: [{ id: 42, notes: null, tags: ["legs", "heavy"], started_at: new Date("2024-01-15") }],
        });

      const result = await toolHandler({
        update_session: { add_tags: ["heavy"] },
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.updated_session).toBe(true);
      expect(parsed.tags).toContain("heavy");
    });

    it("removes tags from session", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: null }] })
        .mockResolvedValueOnce({
          rows: [{ id: 42, notes: null, tags: ["legs"], started_at: new Date("2024-01-15") }],
        });

      const result = await toolHandler({
        update_session: { remove_tags: ["heavy"] },
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.updated_session).toBe(true);
    });

    it("rejects empty update_session", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ session_id: 42, started_at: new Date("2024-01-15"), is_validated: false, deleted_at: null }],
      });

      const result = await toolHandler({ update_session: {} });
      expect(result.isError).toBe(true);
    });
  });

  describe("negative set indices", () => {
    it("resolves -1 to last set", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        // resolveSetNumbers - get max set
        .mockResolvedValueOnce({ rows: [{ max_set: 4 }] })
        .mockResolvedValueOnce({ rows: [{ total: 4 }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // remaining check
        .mockResolvedValueOnce({ rows: [{ set_id: 1, set_number: 1 }, { set_id: 2, set_number: 2 }, { set_id: 3, set_number: 3 }] });

      const result = await toolHandler({
        exercise: "Bench Press", action: "delete", set_numbers: [-1],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.deleted).toBe(true);
      expect(parsed.set_numbers).toEqual([4]); // -1 resolved to 4
    });

    it("resolves multiple negative indices", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 10, session_id: 5, started_at: new Date("2024-01-15") }] })
        .mockResolvedValueOnce({ rows: [{ max_set: 5 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rowCount: 2 })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ set_id: 1, set_number: 1 }, { set_id: 2, set_number: 2 }, { set_id: 3, set_number: 3 }] });

      const result = await toolHandler({
        exercise: "Bench Press", action: "delete", set_numbers: [-2, -1],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.set_numbers).toEqual([4, 5]); // -2, -1 resolved to 4, 5
    });
  });

  it("returns error when exercise not found in session", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await toolHandler({
      exercise: "Bench Press", action: "update", updates: { weight: 100 },
    });
    expect(result.isError).toBe(true);
  });
});
