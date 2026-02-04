/**
 * Performance Benchmark: All manage_program actions
 *
 * Run with: export $(grep -v '^#' .env | xargs) && npx tsx scripts/benchmark-programs.ts
 *
 * Measures timing and documents query counts for each operation.
 */

import pool from "../src/db/connection.js";

const USER_ID = 1;
const ITERATIONS = 5;

interface BenchmarkResult {
  action: string;
  description: string;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  queries: number; // Documented query count
  msPerQuery: number;
}

const results: BenchmarkResult[] = [];

async function measure(
  action: string,
  description: string,
  queries: number, // Manually documented
  fn: () => Promise<void>,
  iterations = ITERATIONS
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  await fn();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;

  const result: BenchmarkResult = {
    action,
    description,
    iterations,
    avgMs,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    queries,
    msPerQuery: avgMs / queries,
  };

  results.push(result);
  console.log(`  ✓ ${action}: ${result.avgMs.toFixed(0)}ms (${queries} queries)`);
  return result;
}

async function setupTestData() {
  console.log("\n📦 Setting up test data...\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clean up
    await client.query("DELETE FROM programs WHERE user_id = $1 AND name LIKE 'Benchmark%'", [USER_ID]);

    // Create main program: 3 days × 10 exercises
    const { rows: [prog] } = await client.query(
      "INSERT INTO programs (user_id, name, description, is_active, is_validated) VALUES ($1, 'Benchmark Main', 'Test', true, true) RETURNING id",
      [USER_ID]
    );

    const { rows: [ver] } = await client.query(
      "INSERT INTO program_versions (program_id, version_number) VALUES ($1, 1) RETURNING id",
      [prog.id]
    );

    const exerciseNames = ["Bench Press", "Incline Press", "Cable Fly", "Tricep Pushdown", "Overhead Extension",
      "Lateral Raise", "Front Raise", "Chest Dip", "Close Grip Bench", "Skull Crusher"];

    const dayIds: number[] = [];
    const exerciseIds: number[] = [];

    for (let d = 0; d < 3; d++) {
      const { rows: [day] } = await client.query(
        "INSERT INTO program_days (version_id, day_label, weekdays, sort_order) VALUES ($1, $2, $3, $4) RETURNING id",
        [ver.id, `Day ${d + 1}`, [d + 1], d]
      );
      dayIds.push(day.id);

      for (let e = 0; e < exerciseNames.length; e++) {
        let exerciseId: number;
        const { rows: existing } = await client.query(
          "SELECT id FROM exercises WHERE LOWER(name) = LOWER($1) LIMIT 1",
          [exerciseNames[e]]
        );
        if (existing.length > 0) {
          exerciseId = existing[0].id;
        } else {
          const { rows: [created] } = await client.query(
            "INSERT INTO exercises (name, user_id) VALUES ($1, $2) RETURNING id",
            [exerciseNames[e], USER_ID]
          );
          exerciseId = created.id;
        }
        if (d === 0) exerciseIds.push(exerciseId);

        await client.query(
          "INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, target_weight, sort_order) VALUES ($1, $2, 3, 10, $3, $4)",
          [day.id, exerciseId, 50 + e * 5, e]
        );
      }
    }

    // Extra programs for list test
    for (let i = 1; i <= 5; i++) {
      const { rows: [p] } = await client.query(
        "INSERT INTO programs (user_id, name, is_active) VALUES ($1, $2, false) RETURNING id",
        [USER_ID, `Benchmark Extra ${i}`]
      );
      await client.query("INSERT INTO program_versions (program_id, version_number) VALUES ($1, 1)", [p.id]);
    }

    await client.query("COMMIT");

    // Get IDs for tests
    const { rows: [pde] } = await pool.query(
      `SELECT pde.id FROM program_day_exercises pde
       JOIN program_days pd ON pd.id = pde.day_id
       WHERE pd.version_id = $1 LIMIT 1`,
      [ver.id]
    );

    console.log(`  ✓ Created program (id: ${prog.id}) with 30 exercises`);

    return { programId: prog.id, versionId: ver.id, dayIds, exerciseIds, pdeId: pde.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function runBenchmarks(data: { programId: number; versionId: number; dayIds: number[]; exerciseIds: number[]; pdeId: number }) {
  console.log("\n🏃 Running benchmarks...\n");

  // ========== READ ==========
  console.log("  📖 Read operations:");

  await measure("list", "List programs with day counts (CTE + JOIN)", 1, async () => {
    await pool.query(
      `WITH latest AS (SELECT DISTINCT ON (program_id) id, program_id FROM program_versions ORDER BY program_id, version_number DESC)
       SELECT p.id, p.name, COUNT(pd.id) FROM programs p
       LEFT JOIN latest l ON l.program_id = p.id LEFT JOIN program_days pd ON pd.version_id = l.id
       WHERE p.user_id = $1 GROUP BY p.id`,
      [USER_ID]
    );
  });

  await measure("get", "Get program with exercises (JSON agg)", 1, async () => {
    await pool.query(
      `SELECT pd.id, pd.day_label, json_agg(json_build_object('id', pde.id, 'name', e.name, 'sets', pde.target_sets) ORDER BY pde.sort_order) as exercises
       FROM program_days pd LEFT JOIN program_day_exercises pde ON pde.day_id = pd.id LEFT JOIN exercises e ON e.id = pde.exercise_id
       WHERE pd.version_id = $1 GROUP BY pd.id ORDER BY pd.sort_order`,
      [data.versionId]
    );
  });

  await measure("history", "Get version history", 1, async () => {
    await pool.query("SELECT version_number, created_at FROM program_versions WHERE program_id = $1 ORDER BY version_number DESC", [data.programId]);
  });

  // ========== PATCH (OPTIMIZED) ==========
  console.log("\n  ⚡ Patch operations (inline, no versioning):");

  await measure("patch_exercise", "Update single exercise weight/reps", 1, async () => {
    await pool.query("UPDATE program_day_exercises SET target_weight = $1, target_reps = 12 WHERE id = $2", [Math.random() * 100, data.pdeId]);
  });

  await measure("patch_day", "Update day label", 1, async () => {
    await pool.query("UPDATE program_days SET day_label = $1 WHERE id = $2", [`Day ${Math.random()}`, data.dayIds[0]]);
  });

  let addedId: number | null = null;
  await measure("add_exercise", "Add exercise (SELECT max + INSERT)", 2, async () => {
    const { rows: [m] } = await pool.query("SELECT COALESCE(MAX(sort_order),-1)+1 as n FROM program_day_exercises WHERE day_id=$1", [data.dayIds[0]]);
    const { rows: [ins] } = await pool.query(
      "INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, sort_order) VALUES ($1,$2,3,10,$3) RETURNING id",
      [data.dayIds[0], data.exerciseIds[0], m.n]
    );
    addedId = ins.id;
  });

  await measure("remove_exercise", "Delete exercise", 1, async () => {
    if (addedId) await pool.query("DELETE FROM program_day_exercises WHERE id = $1", [addedId]);
  });

  // ========== METADATA ==========
  console.log("\n  📝 Metadata updates:");

  await measure("update_metadata", "Update program description", 1, async () => {
    await pool.query("UPDATE programs SET description = $1 WHERE id = $2", [`Updated ${Date.now()}`, data.programId]);
  });

  await measure("activate", "Set active program", 1, async () => {
    await pool.query("UPDATE programs SET is_active = (id = $2) WHERE user_id = $1", [USER_ID, data.programId]);
  });

  // ========== HEAVY (VERSIONED) ==========
  console.log("\n  🏋️ Heavy operations (versioned):");
  // 3 days × 10 exercises = 30 exercises
  // update_full: BEGIN + SELECT max + INSERT version + SELECT days(1) + (3 × (INSERT day + SELECT exercises(1) + 10 × INSERT exercise)) + COMMIT
  // = 2 + 1 + 1 + 3×(1 + 1 + 10) + 1 = 41 queries

  await measure("update_full", "Clone all to new version (3d × 10ex)", 41, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [cv] } = await client.query("SELECT MAX(version_number) as v FROM program_versions WHERE program_id = $1", [data.programId]);
      const { rows: [nv] } = await client.query("INSERT INTO program_versions (program_id, version_number) VALUES ($1, $2) RETURNING id", [data.programId, cv.v + 1]);
      const { rows: days } = await client.query("SELECT * FROM program_days WHERE version_id = $1", [data.versionId]);
      for (const day of days) {
        const { rows: [nd] } = await client.query("INSERT INTO program_days (version_id, day_label, weekdays, sort_order) VALUES ($1,$2,$3,$4) RETURNING id", [nv.id, day.day_label, day.weekdays, day.sort_order]);
        const { rows: exs } = await client.query("SELECT * FROM program_day_exercises WHERE day_id = $1", [day.id]);
        for (const ex of exs) {
          await client.query("INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, target_weight, sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
            [nd.id, ex.exercise_id, ex.target_sets, ex.target_reps, ex.target_weight, ex.sort_order]);
        }
      }
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }, 3);

  // create: BEGIN + INSERT program + INSERT version + 3×(INSERT day + 10×INSERT exercise) + COMMIT = 2 + 1 + 1 + 33 + 1 = 38
  await measure("create", "Create new program (3d × 10ex)", 38, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [p] } = await client.query("INSERT INTO programs (user_id, name) VALUES ($1, $2) RETURNING id", [USER_ID, `BenchCreate${Date.now()}`]);
      const { rows: [v] } = await client.query("INSERT INTO program_versions (program_id, version_number) VALUES ($1, 1) RETURNING id", [p.id]);
      for (let d = 0; d < 3; d++) {
        const { rows: [day] } = await client.query("INSERT INTO program_days (version_id, day_label, sort_order) VALUES ($1, $2, $3) RETURNING id", [v.id, `D${d}`, d]);
        for (let e = 0; e < 10; e++) {
          await client.query("INSERT INTO program_day_exercises (day_id, exercise_id, target_sets, target_reps, sort_order) VALUES ($1,$2,3,10,$3)", [day.id, data.exerciseIds[e % 10], e]);
        }
      }
      await client.query("COMMIT");
      // Cleanup
      await pool.query("DELETE FROM programs WHERE id = $1", [p.id]);
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }, 3);

  // ========== DELETE ==========
  console.log("\n  🗑️ Delete operations:");

  await measure("delete_soft", "Soft delete (UPDATE)", 1, async () => {
    await pool.query("UPDATE programs SET is_active = FALSE WHERE name = 'Benchmark Extra 1'");
  });

  await measure("delete_hard", "Hard delete (INSERT + DELETE)", 2, async () => {
    const { rows: [t] } = await pool.query("INSERT INTO programs (user_id, name) VALUES ($1, $2) RETURNING id", [USER_ID, `Del${Date.now()}`]);
    await pool.query("DELETE FROM programs WHERE id = $1", [t.id]);
  });
}

async function cleanup() {
  console.log("\n🧹 Cleaning up...");
  await pool.query("DELETE FROM programs WHERE user_id = $1 AND name LIKE 'Benchmark%'", [USER_ID]);
  console.log("  ✓ Done");
}

function printReport() {
  console.log("\n" + "═".repeat(95));
  console.log("\n📊 PERFORMANCE REPORT: manage_program\n");
  console.log("═".repeat(95));

  const cats = [
    { name: "📖 Read", actions: ["list", "get", "history"] },
    { name: "⚡ Patch (Optimized)", actions: ["patch_exercise", "patch_day", "add_exercise", "remove_exercise"] },
    { name: "📝 Metadata", actions: ["update_metadata", "activate"] },
    { name: "🏋️ Heavy (Versioned)", actions: ["update_full", "create"] },
    { name: "🗑️ Delete", actions: ["delete_soft", "delete_hard"] },
  ];

  for (const cat of cats) {
    console.log(`\n${cat.name}:`);
    console.log("─".repeat(95));
    console.log("Action".padEnd(18) + "Description".padEnd(40) + "Queries".padStart(8) + "Avg ms".padStart(10) + "Min".padStart(8) + "Max".padStart(8) + "ms/qry".padStart(10));
    console.log("─".repeat(95));
    for (const a of cat.actions) {
      const r = results.find(x => x.action === a);
      if (r) console.log(r.action.padEnd(18) + r.description.substring(0, 39).padEnd(40) + r.queries.toString().padStart(8) + r.avgMs.toFixed(0).padStart(10) + r.minMs.toFixed(0).padStart(8) + r.maxMs.toFixed(0).padStart(8) + r.msPerQuery.toFixed(0).padStart(10));
    }
  }

  console.log("\n" + "═".repeat(95));
  console.log("\n⚡ KEY INSIGHTS:\n");

  const patch = results.find(r => r.action === "patch_exercise");
  const full = results.find(r => r.action === "update_full");
  if (patch && full) {
    console.log(`  patch_exercise vs update_full:`);
    console.log(`    • Time:    ${patch.avgMs.toFixed(0)}ms vs ${full.avgMs.toFixed(0)}ms (${(full.avgMs / patch.avgMs).toFixed(0)}x faster)`);
    console.log(`    • Queries: ${patch.queries} vs ${full.queries} (${full.queries / patch.queries}x fewer)`);
  }

  console.log("\n  Optimization opportunities:");
  const sorted = [...results].sort((a, b) => b.queries - a.queries);
  for (const r of sorted.slice(0, 2)) {
    if (r.queries > 5) console.log(`    • ${r.action}: ${r.queries} queries, ${r.msPerQuery.toFixed(0)}ms/query → batch INSERTs could reduce to ~5 queries`);
  }

  console.log("\n" + "═".repeat(95) + "\n");
}

async function main() {
  console.log("\n🏋️ MANAGE_PROGRAM BENCHMARK");
  console.log("═".repeat(95));
  console.log(`Database: Neon | Iterations: ${ITERATIONS} | Program: 3 days × 10 exercises\n`);

  try {
    const data = await setupTestData();
    await runBenchmarks(data);
    printReport();
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch(console.error);
