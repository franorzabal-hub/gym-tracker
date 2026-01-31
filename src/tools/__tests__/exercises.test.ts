import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../db/connection.js", () => ({
  default: { query: mockQuery, connect: vi.fn() },
}));

vi.mock("../../helpers/exercise-resolver.js", () => ({
  resolveExercise: vi.fn(),
  searchExercises: vi.fn(),
}));

vi.mock("../../context/user-context.js", () => ({
  getUserId: vi.fn().mockReturnValue(1),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExercisesTool } from "../exercises.js";
import { resolveExercise, searchExercises } from "../../helpers/exercise-resolver.js";

const mockResolve = resolveExercise as ReturnType<typeof vi.fn>;
const mockSearch = searchExercises as ReturnType<typeof vi.fn>;

let toolHandler: Function;

describe("manage_exercises tool", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolve.mockReset();
    mockSearch.mockReset();

    const server = {
      tool: vi.fn((_name: string, _desc: string, _schema: any, handler: Function) => {
        toolHandler = handler;
      }),
    } as unknown as McpServer;
    registerExercisesTool(server);
  });

  describe("list action", () => {
    it("returns all exercises", async () => {
      mockSearch.mockResolvedValueOnce([
        { id: 1, name: "Bench Press", muscle_group: "chest", equipment: "barbell", aliases: ["press banca"] },
      ]);

      const result = await toolHandler({ action: "list" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exercises).toHaveLength(1);
      expect(mockSearch).toHaveBeenCalledWith(undefined, undefined);
    });

    it("filters by muscle group", async () => {
      mockSearch.mockResolvedValueOnce([]);
      await toolHandler({ action: "list", muscle_group: "chest" });
      expect(mockSearch).toHaveBeenCalledWith(undefined, "chest");
    });
  });

  describe("search action", () => {
    it("searches by name", async () => {
      mockSearch.mockResolvedValueOnce([
        { id: 1, name: "Bench Press", muscle_group: "chest", equipment: "barbell", aliases: [] },
      ]);

      const result = await toolHandler({ action: "search", name: "bench" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exercises).toHaveLength(1);
      expect(mockSearch).toHaveBeenCalledWith("bench", undefined);
    });
  });

  describe("add_bulk action", () => {
    it("rejects when exercises array missing", async () => {
      const result = await toolHandler({ action: "add_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("exercises array required");
    });

    it("creates new exercises and identifies existing ones", async () => {
      mockResolve
        .mockResolvedValueOnce({ id: 1, name: "Plancha", isNew: true, exerciseType: "mobility" })
        .mockResolvedValueOnce({ id: 2, name: "Bench Press", isNew: false, exerciseType: "strength" });

      const result = await toolHandler({
        action: "add_bulk",
        exercises: [
          { name: "Plancha", rep_type: "seconds", exercise_type: "mobility" },
          { name: "Bench Press" },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toEqual(["Plancha"]);
      expect(parsed.existing).toEqual(["Bench Press"]);
      expect(parsed.total).toBe(2);
      expect(mockResolve).toHaveBeenCalledWith("Plancha", undefined, undefined, "seconds", "mobility");
      expect(mockResolve).toHaveBeenCalledWith("Bench Press", undefined, undefined, undefined, undefined);
    });

    it("inserts aliases for bulk exercises", async () => {
      mockResolve.mockResolvedValueOnce({ id: 10, name: "Plancha", isNew: true });
      mockQuery.mockResolvedValue({});

      await toolHandler({
        action: "add_bulk",
        exercises: [
          { name: "Plancha", aliases: ["plank", "tabla"] },
        ],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO exercise_aliases"),
        [10, "plank"]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO exercise_aliases"),
        [10, "tabla"]
      );
    });
  });

  describe("delete action", () => {
    it("rejects deleting a global exercise", async () => {
      // Check global returns exercise with user_id=null
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: null }] });

      const result = await toolHandler({ action: "delete", name: "Bench Press" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("global and cannot be deleted");
    });

    it("deletes user-owned exercise", async () => {
      // Check global: user-owned
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      // Refs count
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      // Delete
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: "My Exercise" }] });

      const result = await toolHandler({ action: "delete", name: "My Exercise" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted.name).toBe("My Exercise");
    });
  });

  describe("delete_bulk action", () => {
    it("rejects without names array", async () => {
      const result = await toolHandler({ action: "delete_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("names array required");
    });

    it("deletes user-owned and reports global as failed", async () => {
      // First exercise: user-owned
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "My Exercise" }] });
      // Second exercise: global
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, user_id: null }] });
      // Third exercise: not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: ["My Exercise", "Bench Press", "NonExistent"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["My Exercise"]);
      expect(parsed.failed).toEqual([{ name: "Bench Press", error: "Exercise is global and cannot be deleted" }]);
      expect(parsed.not_found).toEqual(["NonExistent"]);
    });

    it("handles JSON string workaround for names", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "My Exercise" }] });

      const result = await toolHandler({
        action: "delete_bulk",
        names: JSON.stringify(["My Exercise"]),
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["My Exercise"]);
    });
  });

  describe("update action", () => {
    it("rejects updating a global exercise", async () => {
      // Check global returns exercise with user_id=null
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: null }] });

      const result = await toolHandler({ action: "update", name: "Bench Press", muscle_group: "chest" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("global and cannot be modified");
    });

    it("updates user-owned exercise", async () => {
      // Check global: user-owned
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      // Update
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "My Exercise", muscle_group: "chest", equipment: null, rep_type: "reps", exercise_type: "strength" }],
      });

      const result = await toolHandler({ action: "update", name: "My Exercise", muscle_group: "chest" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated.name).toBe("My Exercise");
    });
  });

  describe("update_bulk action", () => {
    it("rejects without exercises array", async () => {
      const result = await toolHandler({ action: "update_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("exercises array required");
    });

    it("updates user-owned and reports global as failed", async () => {
      // First: user-owned
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "My Exercise" }] });
      // Second: global
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2, user_id: null }] });

      const result = await toolHandler({
        action: "update_bulk",
        exercises: [
          { name: "My Exercise", muscle_group: "chest" },
          { name: "Bench Press", equipment: "barbell" },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toEqual(["My Exercise"]);
      expect(parsed.failed).toEqual([{ name: "Bench Press", error: "Exercise is global and cannot be modified" }]);
    });

    it("reports failed when no fields to update", async () => {
      const result = await toolHandler({
        action: "update_bulk",
        exercises: [{ name: "Bench Press" }],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.failed).toEqual([{ name: "Bench Press", error: "No fields to update" }]);
    });

    it("handles JSON string workaround for exercises", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "My Exercise" }] });

      const result = await toolHandler({
        action: "update_bulk",
        exercises: JSON.stringify([{ name: "My Exercise", muscle_group: "chest" }]),
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toEqual(["My Exercise"]);
    });
  });

  describe("add action", () => {
    it("rejects when name missing", async () => {
      const result = await toolHandler({ action: "add" });
      expect(result.isError).toBe(true);
    });

    it("adds exercise via resolver", async () => {
      mockResolve.mockResolvedValueOnce({ id: 50, name: "Cable Fly", isNew: true });

      const result = await toolHandler({
        action: "add", name: "Cable Fly", muscle_group: "chest", equipment: "cable",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exercise.name).toBe("Cable Fly");
      expect(parsed.is_new).toBe(true);
    });

    it("adds aliases when provided", async () => {
      mockResolve.mockResolvedValueOnce({ id: 50, name: "Cable Fly", isNew: true });
      mockQuery.mockResolvedValue({});

      await toolHandler({
        action: "add", name: "Cable Fly", aliases: ["cruces en polea", "cable crossover"],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO exercise_aliases"),
        [50, "cruces en polea"]
      );
    });
  });
});
