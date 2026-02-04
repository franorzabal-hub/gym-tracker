import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import pool from "../db/connection.js";
import { getUserId } from "../context/user-context.js";
import { widgetResponse, registerAppToolWithMeta, safeHandler, APP_CONTEXT } from "../helpers/tool-response.js";
import { getProfile } from "../helpers/profile-helpers.js";

const METRICS = ["streak", "volume", "frequency", "prs", "muscle_groups", "body_weight", "top_exercises"] as const;
type Metric = (typeof METRICS)[number];

const PERIOD_DAYS: Record<string, number> = {
  month: 30,
  "3months": 90,
  year: 365,
  all: 36500,
};

export function registerDashboardTool(server: McpServer) {
  registerAppToolWithMeta(server, "show_dashboard", {
    title: "Training Dashboard",
    description: `${APP_CONTEXT}Display a visual KPI dashboard with training metrics: streak, weekly volume, frequency, recent PRs, muscle group distribution, body weight trend, and top exercises. The widget shows all data visually — do NOT repeat it in your response. Just confirm it's displayed or offer next steps.
Use the "metric" param to show only a specific card full-width (e.g. metric: "prs" for recent PRs only).
Use the "period" param to control the time range (default: 3months).`,
    inputSchema: {
      metric: z.enum(METRICS).optional().describe("Show only this metric card full-width. Omit to show all cards in a carousel."),
      period: z.enum(["month", "3months", "year", "all"]).optional().describe("Time range for data. Default: 3months."),
    },
    annotations: { readOnlyHint: true },
    _meta: {
      ui: { resourceUri: "ui://gym-tracker/dashboard.html" },
      "openai/toolInvocation/invoking": "Loading dashboard...",
      "openai/toolInvocation/invoked": "Dashboard loaded",
    },
  }, safeHandler("show_dashboard", async ({ metric, period }: { metric?: Metric; period?: string }) => {
    const userId = getUserId();
    const p = period || "3months";
    const days = PERIOD_DAYS[p] || PERIOD_DAYS["3months"];

    const shouldFetch = (m: Metric) => !metric || metric === m;

    const [streak, volume, frequency, prs, muscleGroups, bodyWeight, topExercises, pendingValidation] = await Promise.all([
      shouldFetch("streak") ? fetchStreak(userId, days) : null,
      shouldFetch("volume") ? fetchWeeklyVolume(userId, days) : null,
      shouldFetch("frequency") ? fetchFrequency(userId, days) : null,
      shouldFetch("prs") ? fetchRecentPRs(userId) : null,
      shouldFetch("muscle_groups") ? fetchMuscleGroups(userId, days) : null,
      shouldFetch("body_weight") ? fetchBodyWeight(userId) : null,
      shouldFetch("top_exercises") ? fetchTopExercises(userId, days) : null,
      fetchPendingValidation(userId),
    ]);

    // Get user's locale
    const userProfile = await getProfile();
    const locale = (userProfile.language as string) || "en";

    const data: Record<string, unknown> = { period: p, _locale: locale };
    if (metric) data.metric = metric;
    if (streak) data.streak = streak;
    if (volume) data.volume_weekly = volume;
    if (frequency) data.frequency = frequency;
    if (prs) data.recent_prs = prs;
    if (muscleGroups) data.muscle_groups = muscleGroups;
    if (bodyWeight) data.body_weight = bodyWeight;
    if (topExercises) data.top_exercises = topExercises;
    if (pendingValidation && (pendingValidation.sessions > 0 || pendingValidation.programs > 0)) {
      data.pending_validation = pendingValidation;
    }

    return widgetResponse(
      `Dashboard widget displayed. The user can see all metrics visually. Do NOT describe, list, or summarize any dashboard data in text.`,
      data,
    );
  }));
}

async function fetchStreak(userId: number, days: number) {
  const { rows } = await pool.query(
    `SELECT DATE_TRUNC('week', started_at)::date AS week, COUNT(*) AS cnt
     FROM sessions
     WHERE user_id = $1 AND deleted_at IS NULL AND is_validated = true
       AND started_at >= NOW() - make_interval(days => $2)
     GROUP BY week ORDER BY week`,
    [userId, days],
  );

  if (rows.length === 0) {
    return { current_weeks: 0, longest_weeks: 0, this_week: 0, target: 1 };
  }

  // Count consecutive weeks from most recent backwards
  const weekSet = new Set(rows.map((r: any) => r.week.toISOString().slice(0, 10)));
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  let current = 0;
  const d = new Date(thisMonday);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (weekSet.has(key)) {
      current++;
      d.setDate(d.getDate() - 7);
    } else {
      // Check if we're in current week (may not have trained yet)
      if (current === 0 && d.getTime() === thisMonday.getTime()) {
        d.setDate(d.getDate() - 7);
        continue;
      }
      break;
    }
  }

  // Compute longest streak
  const sortedWeeks = [...weekSet].sort();
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sortedWeeks.length; i++) {
    const prev = new Date(sortedWeeks[i - 1]);
    const curr = new Date(sortedWeeks[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  // This week's sessions
  const thisWeekKey = thisMonday.toISOString().slice(0, 10);
  const thisWeekRow = rows.find((r: any) => r.week.toISOString().slice(0, 10) === thisWeekKey);
  const thisWeek = thisWeekRow ? Number(thisWeekRow.cnt) : 0;

  return { current_weeks: current, longest_weeks: longest, this_week: thisWeek, target: 1 };
}

async function fetchWeeklyVolume(userId: number, days: number) {
  const { rows } = await pool.query(
    `SELECT DATE_TRUNC('week', s.started_at)::date AS week,
            COALESCE(SUM(st.weight * st.reps), 0)::numeric AS volume
     FROM sessions s
     JOIN session_exercises se ON se.session_id = s.id
     JOIN sets st ON st.session_exercise_id = se.id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.is_validated = true
       AND s.started_at >= NOW() - make_interval(days => $2)
     GROUP BY week ORDER BY week`,
    [userId, days],
  );
  return rows.map((r: any) => ({ week: r.week.toISOString().slice(0, 10), volume: Number(r.volume) }));
}

async function fetchFrequency(userId: number, days: number) {
  const { rows } = await pool.query(
    `SELECT DATE_TRUNC('week', started_at)::date AS week, COUNT(*)::int AS count
     FROM sessions
     WHERE user_id = $1 AND deleted_at IS NULL AND is_validated = true
       AND started_at >= NOW() - make_interval(days => $2)
     GROUP BY week ORDER BY week`,
    [userId, days],
  );
  const weekly = rows.map((r: any) => ({ week: r.week.toISOString().slice(0, 10), count: r.count }));
  const total = weekly.reduce((s: number, w: any) => s + w.count, 0);
  const avg = weekly.length > 0 ? +(total / weekly.length).toFixed(1) : 0;
  return { avg_per_week: avg, total, weekly };
}

async function fetchRecentPRs(userId: number) {
  const { rows } = await pool.query(
    `SELECT e.name AS exercise, prh.record_type, prh.value, prh.achieved_at
     FROM pr_history prh
     JOIN exercises e ON e.id = prh.exercise_id
     WHERE prh.user_id = $1
     ORDER BY prh.achieved_at DESC
     LIMIT 5`,
    [userId],
  );
  return rows.map((r: any) => ({
    exercise: r.exercise,
    record_type: r.record_type,
    value: Number(r.value),
    achieved_at: r.achieved_at.toISOString().slice(0, 10),
  }));
}

async function fetchMuscleGroups(userId: number, days: number) {
  const { rows } = await pool.query(
    `SELECT e.muscle_group,
            COALESCE(SUM(st.weight * st.reps), 0)::numeric AS volume,
            COUNT(st.id)::int AS sets
     FROM sessions s
     JOIN session_exercises se ON se.session_id = s.id
     JOIN exercises e ON e.id = se.exercise_id
     JOIN sets st ON st.session_exercise_id = se.id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.is_validated = true
       AND s.started_at >= NOW() - make_interval(days => $2)
       AND e.muscle_group IS NOT NULL
     GROUP BY e.muscle_group
     ORDER BY volume DESC`,
    [userId, days],
  );
  return rows.map((r: any) => ({
    muscle_group: r.muscle_group,
    volume: Number(r.volume),
    sets: r.sets,
  }));
}

async function fetchBodyWeight(userId: number) {
  const { rows } = await pool.query(
    `SELECT value, measured_at
     FROM body_measurements
     WHERE user_id = $1 AND measurement_type = 'weight_kg'
     ORDER BY measured_at DESC
     LIMIT 20`,
    [userId],
  );
  if (rows.length === 0) return null;
  return rows
    .reverse()
    .map((r: any) => ({
      value: Number(r.value),
      measured_at: r.measured_at.toISOString().slice(0, 10),
    }));
}

async function fetchTopExercises(userId: number, days: number) {
  const { rows } = await pool.query(
    `SELECT e.name AS exercise,
            COALESCE(SUM(st.weight * st.reps), 0)::numeric AS volume,
            COUNT(DISTINCT s.id)::int AS sessions
     FROM sessions s
     JOIN session_exercises se ON se.session_id = s.id
     JOIN exercises e ON e.id = se.exercise_id
     JOIN sets st ON st.session_exercise_id = se.id
     WHERE s.user_id = $1 AND s.deleted_at IS NULL AND s.is_validated = true
       AND s.started_at >= NOW() - make_interval(days => $2)
     GROUP BY e.name
     ORDER BY volume DESC
     LIMIT 5`,
    [userId, days],
  );
  return rows.map((r: any) => ({
    exercise: r.exercise,
    volume: Number(r.volume),
    sessions: r.sessions,
  }));
}

async function fetchPendingValidation(userId: number) {
  const [sessionsRes, programsRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) as count FROM sessions
       WHERE user_id = $1 AND deleted_at IS NULL AND is_validated = false`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) as count FROM programs
       WHERE user_id = $1 AND is_validated = false`,
      [userId]
    ),
  ]);

  const sessions = Number(sessionsRes.rows[0]?.count || 0);
  const programs = Number(programsRes.rows[0]?.count || 0);

  if (sessions === 0 && programs === 0) {
    return null;
  }

  const parts: string[] = [];
  if (sessions > 0) parts.push(`${sessions} workout${sessions > 1 ? 's' : ''}`);
  if (programs > 0) parts.push(`${programs} programa${programs > 1 ? 's' : ''}`);

  return {
    sessions,
    programs,
    message: `Tienes ${parts.join(' y ')} pendiente${sessions + programs > 1 ? 's' : ''} de validar`,
  };
}
