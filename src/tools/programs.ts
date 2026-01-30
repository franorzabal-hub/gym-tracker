import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { resolveExercise } from "../helpers/exercise-resolver.js";
import {
  getActiveProgram,
  getLatestVersion,
  getProgramDaysWithExercises,
  cloneVersion,
} from "../helpers/program-helpers.js";
import { getUserId } from "../context/user-context.js";

const dayExerciseSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().min(1).default(3),
  reps: z.number().int().min(1).default(10),
  weight: z.number().optional(),
  rpe: z.number().min(1).max(10).optional(),
  superset_group: z.number().int().optional(),
  rest_seconds: z.number().int().optional(),
  notes: z.string().optional(),
});

const daySchema = z.object({
  day_label: z.string(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  exercises: z.array(dayExerciseSchema),
});

export function registerProgramTool(server: McpServer) {
  server.tool(
    "manage_program",
    `Manage workout programs (routines). A program is a weekly routine like PPL, Upper/Lower, Full Body.
Each program has versioned days with exercises. When updated, a new version is created preserving history.

Actions:
- "list": List all programs with their current version and active status
- "get": Get the current version of a program by name, with all days and exercises
- "create": Create a new program with days and exercises (auto-activates it)
- "update": Modify the current version (creates a new version). Pass the full updated days array + change_description.
- "activate": Set a program as the active one (deactivates all others). Only one program can be active.
- "delete": Deactivate a program (soft delete). Use hard_delete=true to permanently remove with all versions/days/exercises (irreversible).
- "history": List all versions of a program with dates and change descriptions

For "create" and "update", pass the "days" array with day_label, weekdays (ISO: 1=Mon..7=Sun), and exercises.
For "update", also pass change_description explaining what changed.
For "activate", pass the program name.`,
    {
      action: z.enum(["list", "get", "create", "update", "activate", "delete", "history"]),
      name: z.string().optional(),
      description: z.string().optional(),
      days: z.array(daySchema).optional(),
      change_description: z.string().optional(),
      hard_delete: z.boolean().optional(),
    },
    async ({ action, name, description, days, change_description, hard_delete }) => {
      const userId = getUserId();

      if (action === "list") {
        const { rows } = await pool.query(
          `SELECT p.id, p.name, p.description, p.is_active,
             (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id) as current_version,
             (SELECT COUNT(*) FROM program_days pd
              JOIN program_versions pv ON pv.id = pd.version_id
              WHERE pv.program_id = p.id AND pv.version_number = (SELECT MAX(version_number) FROM program_versions WHERE program_id = p.id)
             ) as days_count
           FROM programs p WHERE p.user_id = $1 ORDER BY p.is_active DESC, p.name`,
          [userId]
        );
        const active = rows.find((r) => r.is_active);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                active_program: active ? active.name : null,
                programs: rows,
              }),
            },
          ],
        };
      }

      if (action === "get") {
        const program = name
          ? await pool
              .query(
                `SELECT p.id, p.name, p.description, pv.id as version_id, pv.version_number
               FROM programs p JOIN program_versions pv ON pv.program_id = p.id
               WHERE p.user_id = $1 AND LOWER(p.name) = LOWER($2)
               ORDER BY pv.version_number DESC LIMIT 1`,
                [userId, name]
              )
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Program not found" }) }],
            isError: true,
          };
        }

        const days = await getProgramDaysWithExercises(program.version_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                program: {
                  name: program.name,
                  description: program.description,
                  version: program.version_number,
                  days,
                },
              }),
            },
          ],
        };
      }

      if (action === "create") {
        if (!name || !days || days.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Name and days are required" }),
              },
            ],
            isError: true,
          };
        }

        // Check if program name already exists for this user
        const existing = await pool.query(
          "SELECT id FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, name]
        );
        if (existing.rows.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Program "${name}" already exists. Use action "update" to modify it, or "delete" first to recreate.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Deactivate other programs for this user
          await client.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);

          const {
            rows: [prog],
          } = await client.query(
            `INSERT INTO programs (user_id, name, description, is_active) VALUES ($1, $2, $3, TRUE)
             RETURNING id`,
            [userId, name, description || null]
          );

          const {
            rows: [ver],
          } = await client.query(
            `INSERT INTO program_versions (program_id, version_number, change_description)
             VALUES ($1, 1, 'Initial version') RETURNING id`,
            [prog.id]
          );

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              const resolved = await resolveExercise(ex.exercise);
              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  newDay.id,
                  resolved.id,
                  ex.sets,
                  ex.reps,
                  ex.weight || null,
                  ex.rpe || null,
                  j,
                  ex.superset_group || null,
                  ex.rest_seconds || null,
                  ex.notes || null,
                ]
              );
            }
          }

          await client.query("COMMIT");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  program: { id: prog.id, name, version: 1 },
                  days_created: days.length,
                }),
              },
            ],
          };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "update") {
        if (!days || days.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Days array required for update" }),
              },
            ],
            isError: true,
          };
        }

        // Find program
        const program = name
          ? await pool
              .query("SELECT id FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)", [
                userId, name,
              ])
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Program not found" }) }],
            isError: true,
          };
        }

        const latestVersion = await getLatestVersion(program.id);
        if (!latestVersion) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "No version found" }) }],
            isError: true,
          };
        }

        const newVersionNumber = latestVersion.version_number + 1;
        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const {
            rows: [ver],
          } = await client.query(
            `INSERT INTO program_versions (program_id, version_number, change_description)
             VALUES ($1, $2, $3) RETURNING id`,
            [program.id, newVersionNumber, change_description || null]
          );

          for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const {
              rows: [newDay],
            } = await client.query(
              `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
               VALUES ($1, $2, $3, $4) RETURNING id`,
              [ver.id, day.day_label, day.weekdays || null, i]
            );

            for (let j = 0; j < day.exercises.length; j++) {
              const ex = day.exercises[j];
              const resolved = await resolveExercise(ex.exercise);
              await client.query(
                `INSERT INTO program_day_exercises
                   (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  newDay.id,
                  resolved.id,
                  ex.sets,
                  ex.reps,
                  ex.weight || null,
                  ex.rpe || null,
                  j,
                  ex.superset_group || null,
                  ex.rest_seconds || null,
                  ex.notes || null,
                ]
              );
            }
          }

          await client.query("COMMIT");

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  program: { name: name || program.name, version: newVersionNumber },
                  change_description,
                }),
              },
            ],
          };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === "activate") {
        if (!name) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
            isError: true,
          };
        }
        const prog = await pool.query(
          "SELECT id, name FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
          [userId, name]
        );
        if (prog.rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Program "${name}" not found` }) }],
            isError: true,
          };
        }
        await pool.query("UPDATE programs SET is_active = FALSE WHERE user_id = $1", [userId]);
        await pool.query("UPDATE programs SET is_active = TRUE WHERE id = $1", [prog.rows[0].id]);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                activated: prog.rows[0].name,
                message: `"${prog.rows[0].name}" is now the active program. All other programs deactivated.`,
              }),
            },
          ],
        };
      }

      if (action === "delete") {
        if (!name) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Name required" }) }],
            isError: true,
          };
        }

        if (hard_delete) {
          const del = await pool.query(
            "DELETE FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
            [userId, name]
          );
          if (del.rows.length === 0) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: `Program "${name}" not found` }) }],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  deleted: del.rows[0].name,
                  message: `"${del.rows[0].name}" has been permanently deleted with all versions, days, and exercise assignments. This is irreversible.`,
                }),
              },
            ],
          };
        }

        const del = await pool.query(
          "UPDATE programs SET is_active = FALSE WHERE user_id = $1 AND LOWER(name) = LOWER($2) RETURNING name",
          [userId, name]
        );
        if (del.rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Program "${name}" not found` }) }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                deactivated: del.rows[0].name,
                message: `"${del.rows[0].name}" has been deactivated. Use "activate" to reactivate it, or use hard_delete=true to permanently remove.`,
              }),
            },
          ],
        };
      }

      if (action === "history") {
        const program = name
          ? await pool
              .query(
                "SELECT id, name FROM programs WHERE user_id = $1 AND LOWER(name) = LOWER($2)",
                [userId, name]
              )
              .then((r) => r.rows[0])
          : await getActiveProgram();

        if (!program) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Program not found" }) }],
            isError: true,
          };
        }

        const { rows: versions } = await pool.query(
          `SELECT version_number, change_description, created_at
           FROM program_versions WHERE program_id = $1 ORDER BY version_number DESC`,
          [program.id]
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                program: program.name,
                versions,
              }),
            },
          ],
        };
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "Unknown action" }) },
        ],
        isError: true,
      };
    }
  );
}
