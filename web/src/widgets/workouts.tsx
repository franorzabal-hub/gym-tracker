import { createRoot } from "react-dom/client";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
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

function SessionCard({ session, onClick }: { session: Session; onClick: () => void }) {
  const duration = formatDuration(session.started_at, session.ended_at);

  return (
    <div className="card" onClick={onClick} style={{ cursor: "pointer", transition: "border-color 0.15s" }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--primary)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(session.started_at)}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {formatTime(session.started_at)}
            {duration && ` · ${duration}`}
          </div>
        </div>
        {!session.ended_at && <span className="badge badge-success">Active</span>}
      </div>

      {(session.program_day || (session.tags && session.tags.length > 0)) && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {session.program_day && <span className="badge badge-primary">{session.program_day}</span>}
          {session.tags?.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-secondary)" }}>
        <span>{session.exercises_count} exercise{session.exercises_count !== 1 ? "s" : ""}</span>
        <span>{session.total_sets} set{session.total_sets !== 1 ? "s" : ""}</span>
        {session.total_volume_kg > 0 && <span>{formatVolume(session.total_volume_kg)}</span>}
      </div>
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
      <div style={{ marginBottom: 12 }}>
        <div className="title" style={{ marginBottom: 4 }}>{periodLabel(filters.period)}</div>
        {(filters.exercise || filters.program_day || (filters.tags && filters.tags.length > 0)) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {filters.exercise && <span className="badge badge-primary">{filters.exercise}</span>}
            {filters.program_day && <span className="badge badge-primary">{filters.program_day}</span>}
            {filters.tags?.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div className="stat-value">{summary.total_sessions}</div>
            <div className="stat-label">sessions</div>
          </div>
          <div>
            <div className="stat-value">{summary.total_volume_kg > 0 ? formatVolume(summary.total_volume_kg) : "—"}</div>
            <div className="stat-label">volume</div>
          </div>
          <div>
            <div className="stat-value">{summary.exercises_count}</div>
            <div className="stat-label">exercises</div>
          </div>
        </div>
      </div>

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="empty">No workouts found for this period</div>
      ) : (
        sessions.map(s => (
          <SessionCard
            key={s.session_id}
            session={s}
            onClick={() => callTool("show_workout", { session_id: s.session_id })}
          />
        ))
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><WorkoutsWidget /></AppProvider>
);
