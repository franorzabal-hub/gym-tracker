import { createRoot } from "react-dom/client";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import "../styles.css";

interface Session {
  session_id: number;
  started_at: string;
  ended_at: string | null;
  program_day: string | null;
  tags: string[] | null;
  exercises_count: number;
  total_sets: number;
  total_volume_kg: number;
  muscle_groups?: string[];
  exercise_names?: string[];
}

interface WorkoutsData {
  sessions: Session[];
  summary: { total_sessions: number; total_volume_kg: number; exercises_count: number };
  filters: { period: string; exercise?: string; program_day?: string; tags?: string[] };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(start: string, end: string | null): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, "")}t`;
  return `${kg}kg`;
}

function periodLabel(period: string): string {
  if (period === "today") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  if (period === "year") return "This year";
  return `Last ${period} days`;
}

function SessionRow({ session, onClick }: { session: Session; onClick: () => void }) {
  const duration = formatDuration(session.started_at, session.ended_at);
  const muscleGroups = session.muscle_groups || [];
  const exerciseNames = session.exercise_names || [];
  const iconExercises = exerciseNames.slice(0, 3);

  return (
    <div
      className="card card-tappable"
      onClick={onClick}
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
        {/* Exercise icons cluster */}
        {iconExercises.length > 0 && (
          <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
            {iconExercises.map((name, i) => {
              const mg = muscleGroups[0];
              const color = mg ? MUSCLE_COLOR[mg.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
              return <ExerciseIcon key={i} name={name} color={color} size={16} />;
            })}
          </div>
        )}

        {/* Date + time */}
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{formatDate(session.started_at)}</div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.2 }}>
            {formatTime(session.started_at)}
            {duration && ` · ${duration}`}
          </div>
        </div>

        {/* Program day badge */}
        {session.program_day && (
          <span className="badge badge-primary" style={{ fontSize: 9, flexShrink: 0 }}>{session.program_day}</span>
        )}

        {/* Active badge */}
        {!session.ended_at && (
          <span className="badge badge-success" style={{ fontSize: 9, flexShrink: 0 }}>Active</span>
        )}

        <span style={{ flex: 1 }} />

        {/* Stats summary */}
        <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {session.exercises_count} ex · {session.total_sets} sets
          {session.total_volume_kg > 0 && ` · ${formatVolume(session.total_volume_kg)}`}
        </span>

        {/* Chevron */}
        <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>▸</span>
      </div>

      {/* Bottom row: muscle group badges + tags */}
      {(muscleGroups.length > 0 || (session.tags && session.tags.length > 0)) && (
        <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap", alignItems: "center" }}>
          {muscleGroups.map((mg) => {
            const c = MUSCLE_COLOR[mg.toLowerCase()] || "var(--text-secondary)";
            return (
              <span key={mg} style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 4,
                background: c + "18", color: c,
                fontWeight: 500, textTransform: "capitalize",
              }}>
                {mg}
              </span>
            );
          })}
          {session.tags?.map(t => (
            <span key={t} className="badge badge-muted" style={{ fontSize: 9 }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkoutsWidget() {
  const data = useToolOutput<WorkoutsData>();
  const { callTool } = useCallTool();

  if (!data) return <div className="loading">Loading...</div>;

  const { sessions, summary, filters } = data;

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{periodLabel(filters.period)}</span>
        </div>

        {/* Active filters */}
        {(filters.exercise || filters.program_day || (filters.tags && filters.tags.length > 0)) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {filters.exercise && <span className="badge badge-primary" style={{ fontSize: 10 }}>{filters.exercise}</span>}
            {filters.program_day && <span className="badge badge-primary" style={{ fontSize: 10 }}>{filters.program_day}</span>}
            {filters.tags?.map(t => <span key={t} className="badge badge-muted" style={{ fontSize: 10 }}>{t}</span>)}
          </div>
        )}

        {/* Summary stats inline */}
        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          <span>{summary.total_sessions} session{summary.total_sessions !== 1 ? "s" : ""}</span>
          <span>{summary.exercises_count} exercise{summary.exercises_count !== 1 ? "s" : ""}</span>
          {summary.total_volume_kg > 0 && <span>{formatVolume(summary.total_volume_kg)} total</span>}
        </div>
      </div>

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="empty">No workouts found for this period</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sessions.map(s => (
            <SessionRow
              key={s.session_id}
              session={s}
              onClick={() => callTool("show_workout", { session_id: s.session_id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><WorkoutsWidget /></AppProvider>
);
