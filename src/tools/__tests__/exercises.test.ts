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
