#!/usr/bin/env npx tsx
/**
 * Real Database Query Benchmark for Workout Tools
 *
 * Connects to the dev database and measures actual query patterns.
 * Run with: npx tsx scripts/benchmark-queries.ts
 *
 * Prerequisites:
 * - .env file with DATABASE_URL pointing to dev branch
 * - User ID 1 must exist in the database
 */

import { Pool, PoolClient } from "pg";
import { config } from "dotenv";

config();

// ─── Query Interceptor ─────────────────────────────────────────────────────

interface QueryRecord {
  sql: string;
  params: unknown[];
  duration: number;
}

interface BenchmarkResult {
  operation: string;
  totalQueries: number;
  totalTime: number;
  avgQueryTime: number;
  queries: QueryRecord[];
  selectCount: number;
  insertCount: number;
  updateCount: number;
  deleteCount: number;
}

const queryLog: QueryRecord[] = [];

function clearLog() {
  queryLog.length = 0;
}

// Create a pool with query interception
const originalPool = new Pool({ connectionString: process.env.DATABASE_URL });

const pool = {
  async query(sql: string, params?: unknown[]) {
    const start = performance.now();
    const result = await originalPool.query(sql, params);
    const duration = performance.now() - start;
    queryLog.push({ sql: sql.substring(0, 200), params: params || [], duration });
    return result;
  },
  async connect(): Promise<PoolClient> {
    const client = await originalPool.connect();
    const originalQuery = client.query.bind(client);

    (client as any).query = async (sql: string, params?: unknown[]) => {
      const start = performance.now();
      const result = await originalQuery(sql, params);
      const duration = performance.now() - start;
      queryLog.push({ sql: sql.substring(0, 200), params: params || [], duration });
      return result;
    };

    return client;
  },
};

function analyze(operation: string): BenchmarkResult {
  const totalTime = queryLog.reduce((sum, q) => sum + q.duration, 0);

  return {
    operation,
    totalQueries: queryLog.length,
    totalTime,
    avgQueryTime: queryLog.length > 0 ? totalTime / queryLog.length : 0,
    queries: [...queryLog],
    selectCount: queryLog.filter((q) => q.sql.trim().toUpperCase().startsWith("SELECT")).length,
    insertCount: queryLog.filter((q) => q.sql.trim().toUpperCase().startsWith("INSERT")).length,
    updateCount: queryLog.filter((q) => q.sql.trim().toUpperCase().startsWith("UPDATE")).length,
    deleteCount: queryLog.filter((q) => q.sql.trim().toUpperCase().startsWith("DELETE")).length,
  };
}

function printResult(result: BenchmarkResult) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 ${result.operation}`);
  console.log(`${"═".repeat(70)}`);
  console.log(`Total Queries:    ${result.totalQueries}`);
  console.log(`  ├─ SELECT:      ${result.selectCount}`);
  console.log(`  ├─ INSERT:      ${result.insertCount}`);
  console.log(`  ├─ UPDATE:      ${result.updateCount}`);
  console.log(`  └─ DELETE:      ${result.deleteCount}`);
  console.log(`Total DB Time:    ${result.totalTime.toFixed(2)}ms`);
  console.log(`Avg Query Time:   ${result.avgQueryTime.toFixed(2)}ms`);

  console.log(`\nQueries:`);
  result.queries.forEach((q, i) => {
    const shortSql = q.sql.replace(/\s+/g, " ").substring(0, 65);
    const type = q.sql.trim().split(/\s+/)[0].toUpperCase();
    console.log(`  ${String(i + 1).padStart(2)}. [${type.padEnd(6)}] ${shortSql}${q.sql.length > 65 ? "..." : ""} (${q.duration.toFixed(1)}ms)`);
  });
}

// ─── Benchmark Functions ───────────────────────────────────────────────────

const USER_ID = 1;

async function benchmarkGetWorkouts() {
  clearLog();

  await pool.query(
    `SELECT s.id, s.started_at, s.ended_at, s.tags, s.notes, s.is_validated,
            pd.day_label,
            COUNT(DISTINCT se.id)::int as exercise_count,
            COUNT(sets.id)::int as set_count,
            COALESCE(SUM(sets.weight * sets.reps), 0)::numeric as total_volume
     FROM sessions s
     LEFT JOIN program_days pd ON pd.id = s.program_day_id
     LEFT JOIN session_exercises se ON se.session_id = s.id
     LEFT JOIN sets ON sets.session_exercise_id = se.id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL
       AND s.started_at >= NOW() - INTERVAL '7 days'
     GROUP BY s.id, pd.day_label
     ORDER BY s.started_at DESC`,
    [USER_ID]
  );

  return analyze("get_workouts: last 7 days");
}

async function benchmarkShowWorkout() {
  clearLog();

  // Get a recent session
  const { rows: sessions } = await pool.query(
    `SELECT id FROM sessions WHERE user_id = $1 AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [USER_ID]
  );

  if (sessions.length === 0) {
    console.log("No sessions found for benchmarking show_workout");
    return analyze("show_workout: (no data)");
  }

  const sessionId = sessions[0].id;
  clearLog(); // Clear the lookup query

  // Actual show_workout queries
  await pool.query(
    `SELECT s.id, s.started_at, s.ended_at, s.notes, s.tags, s.is_validated,
            pd.day_label
     FROM sessions s
     LEFT JOIN program_days pd ON pd.id = s.program_day_id
     WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL`,
    [sessionId, USER_ID]
  );

  await pool.query(
    `SELECT se.id, se.exercise_id, e.name, e.muscle_group, e.exercise_type, e.rep_type,
            se.sort_order, se.group_id, se.section_id, se.rest_seconds
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     WHERE se.session_id = $1
     ORDER BY se.sort_order`,
    [sessionId]
  );

  await pool.query(
    `SELECT sets.*, se.exercise_id
     FROM sets
     JOIN session_exercises se ON se.id = sets.session_exercise_id
     WHERE se.session_id = $1
     ORDER BY se.sort_order, sets.set_number`,
    [sessionId]
  );

  await pool.query(
    `SELECT * FROM session_exercise_groups WHERE session_id = $1 ORDER BY sort_order`,
    [sessionId]
  );

  await pool.query(
    `SELECT * FROM session_sections WHERE session_id = $1 ORDER BY sort_order`,
    [sessionId]
  );

  return analyze("show_workout: specific session");
}

async function benchmarkLogWorkoutStart() {
  clearLog();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check for active session
    await client.query(
      `SELECT id, started_at, program_day_id, is_validated
       FROM sessions
       WHERE user_id = $1 AND ended_at IS NULL AND deleted_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [USER_ID]
    );

    // Get active program
    await client.query(
      `SELECT p.id, p.name, pv.id as version_id
       FROM programs p
       JOIN program_versions pv ON pv.program_id = p.id
       WHERE (p.user_id = $1 OR p.user_id IS NULL) AND p.is_active = true
       ORDER BY pv.version_number DESC LIMIT 1`,
      [USER_ID]
    );

    // Get user timezone for day inference
    await client.query(
      `SELECT data->>'timezone' as timezone FROM user_profile WHERE user_id = $1`,
      [USER_ID]
    );

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  return analyze("log_workout: start session (setup)");
}

async function benchmarkEditWorkoutUpdate() {
  clearLog();

  // Find a session_exercise to update
  const { rows: exercises } = await pool.query(
    `SELECT se.id, s.started_at
     FROM session_exercises se
     JOIN sessions s ON s.id = se.session_id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [USER_ID]
  );

  if (exercises.length === 0) {
    console.log("No exercises found for benchmarking edit_workout");
    return analyze("edit_workout: update (no data)");
  }

  const seId = exercises[0].id;
  clearLog();

  // Simulate edit_workout: update weight on specific sets
  await pool.query(
    `SELECT COUNT(*)::int as total FROM sets WHERE session_exercise_id = $1`,
    [seId]
  );

  // The actual update (dry run - we'll rollback)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE sets SET weight = weight WHERE session_exercise_id = $1 AND set_number = 1`,
      [seId]
    );
    await client.query(
      `SELECT id as set_id, set_number, reps, weight, rpe, set_type, notes
       FROM sets WHERE session_exercise_id = $1 ORDER BY set_number`,
      [seId]
    );
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  return analyze("edit_workout: update single set");
}

async function benchmarkValidateWorkout() {
  clearLog();

  // Find an unvalidated session or any session
  const { rows: sessions } = await pool.query(
    `SELECT s.id, s.is_validated
     FROM sessions s
     WHERE s.user_id = $1 AND s.deleted_at IS NULL
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [USER_ID]
  );

  if (sessions.length === 0) {
    return analyze("edit_workout: validate (no data)");
  }

  const sessionId = sessions[0].id;
  clearLog();

  // Simulate validate_workout flow
  await pool.query(
    `SELECT id as session_id, started_at, is_validated, deleted_at
     FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, USER_ID]
  );

  // Get exercises for PR check
  const { rows: exercises } = await pool.query(
    `SELECT se.id, se.exercise_id, e.name as exercise_name, e.exercise_type
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     WHERE se.session_id = $1`,
    [sessionId]
  );

  // For each exercise, get sets and check PRs
  for (const ex of exercises.slice(0, 3)) {
    // Limit to 3 for benchmark
    await pool.query(`SELECT id, reps, weight FROM sets WHERE session_exercise_id = $1`, [ex.id]);

    await pool.query(
      `SELECT record_type, value FROM personal_records WHERE user_id = $1 AND exercise_id = $2`,
      [USER_ID, ex.exercise_id]
    );
  }

  return analyze("edit_workout: validate_workout");
}

async function benchmarkEndWorkout() {
  clearLog();

  const { rows: sessions } = await pool.query(
    `SELECT id FROM sessions
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [USER_ID]
  );

  if (sessions.length === 0) {
    return analyze("end_workout: (no data)");
  }

  const sessionId = sessions[0].id;
  clearLog();

  // end_workout queries
  await pool.query(
    `SELECT id, started_at, ended_at, program_day_id
     FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, USER_ID]
  );

  // Summary aggregation
  await pool.query(
    `SELECT e.name as exercise_name,
            COUNT(sets.id)::int as total_sets,
            SUM(sets.reps)::int as total_reps,
            SUM(sets.weight * sets.reps)::numeric as total_volume
     FROM session_exercises se
     JOIN exercises e ON e.id = se.exercise_id
     JOIN sets ON sets.session_exercise_id = se.id
     WHERE se.session_id = $1
     GROUP BY e.name
     ORDER BY se.sort_order`,
    [sessionId]
  );

  return analyze("end_workout: summary");
}

async function benchmarkGetTodayPlan() {
  clearLog();

  // Get active program
  const { rows: programs } = await pool.query(
    `SELECT p.id, p.name, pv.id as version_id
     FROM programs p
     JOIN program_versions pv ON pv.program_id = p.id
     WHERE (p.user_id = $1 OR p.user_id IS NULL) AND p.is_active = true
     ORDER BY pv.version_number DESC LIMIT 1`,
    [USER_ID]
  );

  if (programs.length === 0) {
    return analyze("get_today_plan: (no program)");
  }

  const versionId = programs[0].version_id;

  // Get days for today (Monday = 1)
  const today = new Date().getDay() || 7; // Convert Sunday=0 to 7
  await pool.query(
    `SELECT id, day_label FROM program_days
     WHERE version_id = $1 AND $2 = ANY(weekdays)
     ORDER BY sort_order LIMIT 1`,
    [versionId, today]
  );

  // Get exercises for the day
  await pool.query(
    `SELECT pde.*, e.name as exercise_name, e.muscle_group, e.exercise_type
     FROM program_day_exercises pde
     JOIN exercises e ON e.id = pde.exercise_id
     JOIN program_days pd ON pd.id = pde.day_id
     WHERE pd.version_id = $1
     ORDER BY pd.sort_order, pde.sort_order`,
    [versionId]
  );

  return analyze("get_today_plan");
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️ Workout Tools Query Benchmark");
  console.log("═".repeat(70));
  console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] || "unknown"}`);
  console.log(`User ID: ${USER_ID}`);

  const results: BenchmarkResult[] = [];

  try {
    results.push(await benchmarkGetWorkouts());
    results.push(await benchmarkShowWorkout());
    results.push(await benchmarkLogWorkoutStart());
    results.push(await benchmarkEditWorkoutUpdate());
    results.push(await benchmarkValidateWorkout());
    results.push(await benchmarkEndWorkout());
    results.push(await benchmarkGetTodayPlan());

    // Print individual results
    results.forEach(printResult);

    // Summary
    console.log("\n\n" + "═".repeat(70));
    console.log("📈 SUMMARY");
    console.log("═".repeat(70));

    const sorted = [...results].sort((a, b) => b.totalQueries - a.totalQueries);
    console.log("\nBy Query Count:");
    sorted.forEach((r, i) => {
      const bar = "█".repeat(Math.min(r.totalQueries, 20));
      console.log(`  ${String(i + 1).padStart(2)}. ${r.operation.padEnd(40)} ${String(r.totalQueries).padStart(2)} ${bar}`);
    });

    console.log("\nBy Total DB Time:");
    [...results].sort((a, b) => b.totalTime - a.totalTime).forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${r.operation.padEnd(40)} ${r.totalTime.toFixed(1)}ms`);
    });

    // Optimization suggestions
    console.log("\n" + "─".repeat(70));
    console.log("💡 OPTIMIZATION OPPORTUNITIES");
    console.log("─".repeat(70));

    const highQuery = sorted.filter((r) => r.totalQueries > 5);
    if (highQuery.length > 0) {
      console.log("\nOperations with >5 queries:");
      highQuery.forEach((r) => {
        console.log(`  • ${r.operation}: ${r.totalQueries} queries, ${r.totalTime.toFixed(1)}ms`);
        if (r.selectCount > 3) {
          console.log(`    → Consider using JOINs or CTEs to reduce ${r.selectCount} SELECTs`);
        }
        if (r.insertCount > 2) {
          console.log(`    → Consider multi-row INSERT for ${r.insertCount} inserts`);
        }
      });
    }
  } finally {
    await originalPool.end();
  }
}

main().catch(console.error);
