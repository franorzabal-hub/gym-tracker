import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight, maxWidth } from "../tokens.js";
import { SessionCard, SessionData, formatShortDate, formatDate } from "./shared/session-view.js";
import "../styles.css";

// ── Types ──

interface WorkoutsData {
  sessions: SessionData[];
  summary: { total_sessions: number; total_volume_kg: number; exercises_count: number };
  filters: { period: string; exercise?: string; program_day?: string; tags?: string[] };
}

// ── Helpers ──

function periodLabel(period: string): string {
  if (period === "today") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  if (period === "year") return "This year";
  return `Last ${period} days`;
}

// ── Skeleton ──

function SkeletonWorkouts() {
  return (
    <div className="profile-card" role="status" aria-label="Loading workouts">
      {/* Tabs skeleton */}
      <div style={{ display: "flex", gap: sp[2], borderBottom: "1px solid var(--border)", paddingBottom: sp[3], marginBottom: sp[6] }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ width: 70, height: 24, borderRadius: radius.sm }} />
        ))}
      </div>
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 140, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 60, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 100, height: font.sm, marginBottom: sp[4] }} />
      </div>
      {/* Exercises skeleton */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[3] }}>
          <div className="skeleton" style={{ width: `${35 + i * 8}%`, height: font.lg }} />
          <div className="skeleton" style={{ width: 70, height: font.md }} />
        </div>
      ))}
      <span className="sr-only">Loading workouts...</span>
    </div>
  );
}

// ── Components ──

/** Session tabs */
function SessionTabs({ sessions, activeIdx, goTo }: { sessions: SessionData[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = sessions.length;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        goTo((activeIdx + 1) % len);
        break;
      case "ArrowLeft":
        e.preventDefault();
        goTo((activeIdx - 1 + len) % len);
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(len - 1);
        break;
    }
  }, [sessions.length, activeIdx, goTo]);

  if (sessions.length <= 1) return null;

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Workouts"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
        scrollbarWidth: "none",
        gap: sp[1],
        marginBottom: sp[6],
      }}
    >
      {sessions.map((session, i) => {
        const isActive = i === activeIdx;
        const label = session.program_day || formatShortDate(session.started_at);

        return (
          <button
            key={session.session_id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`session-panel-${i}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => goTo(i)}
            className="day-tab"
            style={{
              fontSize: font.sm,
              fontWeight: isActive ? weight.semibold : weight.medium,
              marginBottom: "-1px",
              background: "transparent",
              border: "none",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: isActive ? "var(--primary)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`${label} - ${formatDate(session.started_at)}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Widget ──

function WorkoutsWidget() {
  const data = useToolOutput<WorkoutsData>();
  const [activeIdx, setActiveIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    if (data) {
      setActiveIdx(Math.max(0, Math.min(idx, data.sessions.length - 1)));
    }
  }, [data?.sessions.length]);

  if (!data) return <SkeletonWorkouts />;

  const { sessions, summary, filters } = data;

  if (sessions.length === 0) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <p style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[8]}px 0` }}>
          No workouts found for {periodLabel(filters.period).toLowerCase()}. Start a session to begin tracking!
        </p>
      </div>
    );
  }

  const activeSession = sessions[activeIdx];

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label="Workout history"
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: sp[6] }}>
        <h1 style={{ fontSize: font["3xl"], fontWeight: 600, margin: 0 }}>
          Workouts
        </h1>
        <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
          {summary.total_sessions} sessions · {periodLabel(filters.period).toLowerCase()}
        </span>
      </div>

      {/* Active filters */}
      {(filters.exercise || filters.program_day || (filters.tags && filters.tags.length > 0)) && (
        <div style={{ display: "flex", gap: sp[2], flexWrap: "wrap", marginBottom: sp[4] }}>
          {filters.exercise && <span className="badge badge-primary">{filters.exercise}</span>}
          {filters.program_day && <span className="badge badge-primary">{filters.program_day}</span>}
          {filters.tags?.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
        </div>
      )}

      {/* Session tabs */}
      <SessionTabs sessions={sessions} activeIdx={activeIdx} goTo={goTo} />

      {/* Active session content */}
      <div role="tabpanel" id={`session-panel-${activeIdx}`} aria-live="polite">
        <SessionCard session={activeSession} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><WorkoutsWidget /></AppProvider>
);
