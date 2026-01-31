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

  describe("delete_bulk action", () => {
    it("rejects without names array", async () => {
      const result = await toolHandler({ action: "delete_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("names array required");
    });

    it("deletes multiple exercises and reports not_found", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: "Bench Press" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ name: "Squat" }] });

      const result = await toolHandler({
        action: "delete_bulk",

        names: ["Bench Press", "NonExistent", "Squat"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["Bench Press", "Squat"]);
      expect(parsed.not_found).toEqual(["NonExistent"]);
    });

    it("handles JSON string workaround for names", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "Bench Press" }] });

      const result = await toolHandler({
        action: "delete_bulk",

        names: JSON.stringify(["Bench Press"]),
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.deleted).toEqual(["Bench Press"]);
    });
  });

  describe("update_bulk action", () => {
    it("rejects without exercises array", async () => {
      const result = await toolHandler({ action: "update_bulk" });
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("exercises array required");
    });

    it("updates multiple exercises and reports not_found", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: "Bench Press" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await toolHandler({
        action: "update_bulk",
        exercises: [
          { name: "Bench Press", muscle_group: "chest" },
          { name: "NonExistent", equipment: "barbell" },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toEqual(["Bench Press"]);
      expect(parsed.not_found).toEqual(["NonExistent"]);
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
      mockQuery.mockResolvedValueOnce({ rows: [{ name: "Bench Press" }] });

      const result = await toolHandler({
        action: "update_bulk",
        exercises: JSON.stringify([{ name: "Bench Press", muscle_group: "chest" }]),
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.updated).toEqual(["Bench Press"]);
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
