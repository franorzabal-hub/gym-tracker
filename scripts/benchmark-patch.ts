/**
 * Benchmark: patch_exercise vs full update
 *
 * Run with: npx tsx scripts/benchmark-patch.ts
 */

import pool from "../src/db/connection.js";

const USER_ID = 1;

async function setup() {
  // Create a test program with multiple days and exercises
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clean up any existing test program
    await client.query("DELETE FROM programs WHERE user_id = $1 AND name = 'Benchmark Test'", [USER_ID]);

    // Create program
    const { rows: [prog] } = await client.query(
      "INSERT INTO programs (user_id, name, is_active) VALUES ($1, 'Benchmark Test', true) RETURNING id",
      [USER_ID]
    );

    // Create version
    const { rows: [ver] } = await client.query(
      "INSERT INTO program_versions (program_id, version_number) VALUES ($1, 1) RETURNING id",
      [prog.id]
    );

    // Create 3 days with 10 exercises each (30 total)
    const exercises = [
      "Bench Press", "Incline Press", "Cable Fly", "Tricep Pushdown", "Overhead Extension",
      "Lateral Raise", "Front Raise", "Chest Dip", "Close Grip Bench", "Skull Crusher"
    ];

    for (let d = 0; d < 3; d++) {
      const { rows: [day] } = await client.query(
        "INSERT INTO program_days (version_id, day_label, sort_order) VALUES ($1, $2, $3) RETURNING id",
        [ver.id, `Day ${d + 1}`, d]
      );

      for (let e = 0; e < exercises.length; e++) {
        // Get or create exercise
        let exerciseId: number;
        const { rows: existing } = await client.query(
          "SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) AND (user_id IS NULL OR user_id = $2)",
          [exercises[e], USER_ID]
        );
        if (existing.length > 0) {
          exerciseId = existing[0].id;
        } else {
          const { rows: [created] } = await client.query(
            "INSERT INTO exercises (name, user_id) VALUES ($1, $2) RETURNING id",
            [exercises[e], USER_ID]
          );
          exerciseId = created.id;
        }

        await client.query(
          `INSERT INTO program_day_exercises
           (day_id, exercise_id, target_sets, target_reps, target_weight, sort_order)
           VALUES ($1, $2, 3, 10, $3, $4)`,
          [day.id, exerciseId, 50 + e * 5, e]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`✓ Created test program with ${3 * exercises.length} exercises`);
    return { programId: prog.id, versionId: ver.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function benchmarkPatchExercise(programId: number) {
  // Find an exercise to patch
  const { rows: [target] } = await pool.query(
    `SELECT pde.id, e.name, pd.day_label
     FROM program_day_exercises pde
     JOIN program_days pd ON pd.id = pde.day_id
     JOIN program_versions pv ON pv.id = pd.version_id
     JOIN exercises e ON e.id = pde.exercise_id
     WHERE pv.program_id = $1
     LIMIT 1`,
    [programId]
  );

  const iterations = 100;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    // Simulate patch_exercise: single UPDATE query
    await pool.query(
      `UPDATE program_day_exercises
       SET target_weight = $1, target_reps = $2
       WHERE id = $3`,
      [80 + i, 12, target.id]
    );

    times.push(performance.now() - start);
  }

  return {
    method: "patch_exercise",
    iterations,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    p95: times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)],
  };
}

async function benchmarkFullUpdate(programId: number, versionId: number) {
  const iterations = 20; // Fewer iterations since it's much slower
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const client = await pool.connect();
    const start = performance.now();

    try {
      await client.query("BEGIN");

      // Get current version number
      const { rows: [currentVer] } = await client.query(
        "SELECT version_number FROM program_versions WHERE id = $1",
        [versionId]
      );

      // Create new version
      const { rows: [newVer] } = await client.query(
        `INSERT INTO program_versions (program_id, version_number, change_description)
         VALUES ($1, $2, 'Benchmark update')
         RETURNING id`,
        [programId, currentVer.version_number + 1 + i]
      );

      // Get all days
      const { rows: days } = await client.query(
        "SELECT * FROM program_days WHERE version_id = $1 ORDER BY sort_order",
        [versionId]
      );

      // Clone each day with exercises
      for (const day of days) {
        const { rows: [newDay] } = await client.query(
          `INSERT INTO program_days (version_id, day_label, weekdays, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [newVer.id, day.day_label, day.weekdays, day.sort_order]
        );

        // Get and clone exercises
        const { rows: exercises } = await client.query(
          "SELECT * FROM program_day_exercises WHERE day_id = $1 ORDER BY sort_order",
          [day.id]
        );

        for (const ex of exercises) {
          await client.query(
            `INSERT INTO program_day_exercises
             (day_id, exercise_id, target_sets, target_reps, target_weight, target_rpe, sort_order, rest_seconds, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [newDay.id, ex.exercise_id, ex.target_sets, 12, 80 + i, ex.target_rpe, ex.sort_order, ex.rest_seconds, ex.notes]
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    times.push(performance.now() - start);
  }

  return {
    method: "full_update (new version)",
    iterations,
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    p95: times.sort((a, b) => a - b)[Math.floor(iterations * 0.95)],
  };
}

async function cleanup(programId: number) {
  await pool.query("DELETE FROM programs WHERE id = $1", [programId]);
  console.log("✓ Cleaned up test data");
}

async function main() {
  console.log("\n🏋️ Benchmark: patch_exercise vs full update\n");
  console.log("─".repeat(50));

  const { programId, versionId } = await setup();

  console.log("\nRunning benchmarks...\n");

  const patchResult = await benchmarkPatchExercise(programId);
  const fullResult = await benchmarkFullUpdate(programId, versionId);

  console.log("─".repeat(50));
  console.log("\n📊 Results:\n");

  for (const result of [patchResult, fullResult]) {
    console.log(`${result.method}:`);
    console.log(`  iterations: ${result.iterations}`);
    console.log(`  avg: ${result.avg.toFixed(2)}ms`);
    console.log(`  min: ${result.min.toFixed(2)}ms`);
    console.log(`  max: ${result.max.toFixed(2)}ms`);
    console.log(`  p95: ${result.p95.toFixed(2)}ms`);
    console.log();
  }

  const speedup = fullResult.avg / patchResult.avg;
  console.log(`⚡ patch_exercise is ${speedup.toFixed(1)}x faster than full update`);
  console.log();

  await cleanup(programId);
  await pool.end();
}

main().catch(console.error);
