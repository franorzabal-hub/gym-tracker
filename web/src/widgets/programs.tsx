import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef, KeyboardEvent } from "react";
import { useToolOutput, useCallTool, useWidgetState } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight } from "../tokens.js";
import "../styles.css";
import {
  type Day,
  WeekdayPills,
  DayCard,
  DayCarousel,
} from "./shared/program-view.js";

/** Day navigation tabs with accessibility and keyboard support */
function DayTabs({ days, activeIdx, goTo }: { days: Day[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const len = days.length;
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
  };

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Program days"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
        scrollbarWidth: "none",
        gap: sp[1],
      }}
    >
      {days.map((day, i) => {
        const isActive = i === activeIdx;
        // Extract short label: "Día 1" from "Día 1 — Peso Muerto + Push Pecho"
        const shortLabel = day.day_label.split(/\s*[—–-]\s*/)[0] || `Day ${i + 1}`;

        return (
          <button
            key={i}
            role="tab"
            aria-selected={isActive}
            aria-controls={`day-panel-${i}`}
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
            }}
          >
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}

interface ProgramData {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days: Day[];
  is_active?: boolean;
}

/** Skeleton loading state */
function SkeletonProgram() {
  return (
    <div className="profile-card" role="status" aria-label="Loading program">
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[8] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 180, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 60, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 140, height: font.base, marginBottom: sp[4] }} />
        {/* Day tabs skeleton */}
        <div style={{ display: "flex", gap: sp[2], borderBottom: "1px solid var(--border)", paddingBottom: sp[3] }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ width: 50, height: 24, borderRadius: radius.sm }} />
          ))}
        </div>
      </div>
      {/* Day content skeleton */}
      <div>
        <div className="skeleton" style={{ width: 120, height: font.xl, marginBottom: sp[3] }} />
        <div className="skeleton" style={{ width: 100, height: font.sm, marginBottom: sp[4] }} />
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[3] }}>
            <div className="skeleton" style={{ width: `${40 + i * 10}%`, height: font.lg }} />
            <div className="skeleton" style={{ width: 80, height: font.md }} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ToolData {
  program: ProgramData;
  initialDayIdx?: number;
  pendingChanges?: Record<string, any>;
}

function DiffValue({ current, pending }: { current: any; pending: any }) {
  const fmt = (v: any) => String(v ?? "—");
  const hasOld = current != null && current !== "";
  return (
    <span>
      {hasOld && <span className="diff-old">{fmt(current)}</span>}
      {hasOld && " "}
      <span className="diff-new">{fmt(pending)}</span>
    </span>
  );
}

function ConfirmBar({ onConfirm, confirming, confirmed }: {
  onConfirm: () => void;
  confirming: boolean;
  confirmed: boolean;
}) {
  return (
    <div className="confirm-bar-sticky" role="status" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {confirmed ? (
          <span className="profile-confirm-flash">Updated</span>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={confirming}
            aria-busy={confirming}
          >
            {confirming ? "Saving..." : "Confirm Changes"}
          </button>
        )}
      </div>
    </div>
  );
}

function ProgramsWidget() {
  const data = useToolOutput<ToolData>();
  const { callTool } = useCallTool();

  // Persist selected day across re-renders
  const [widgetState, setWidgetState] = useWidgetState(() => ({
    selectedDay: data?.initialDayIdx ?? 0
  }));

  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [localProgram, setLocalProgram] = useState<ProgramData | null>(null);

  const daysLen = data?.program?.days?.length ?? 0;
  const viewingIdx = widgetState.selectedDay;

  const handleConfirm = useCallback(async () => {
    if (!data?.pendingChanges || !data.program) return;
    setConfirming(true);
    const args: Record<string, any> = { action: "update", name: data.program.name };
    if (data.pendingChanges.name) args.new_name = data.pendingChanges.name;
    if (data.pendingChanges.description !== undefined) args.description = data.pendingChanges.description;
    await callTool("manage_program", args);
    setLocalProgram(prev => ({
      ...(prev || data.program),
      ...data.pendingChanges,
    }));
    setConfirming(false);
    setConfirmed(true);
  }, [data, callTool]);

  const goTo = useCallback((idx: number) => {
    const clampedIdx = Math.max(0, Math.min(idx, daysLen - 1));
    setWidgetState(prev => ({ ...prev, selectedDay: clampedIdx }));
  }, [daysLen, setWidgetState]);

  if (!data) return <SkeletonProgram />;
  if (!data.program) return <div className="empty">No program found</div>;

  const program = localProgram || data.program;
  const active = program.is_active ?? false;
  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const viewingWeekdays = program.days[viewingIdx]?.weekdays || [];

  const hasAnyWeekdays = program.days.some(d => d.weekdays && d.weekdays.length > 0);
  const hasPending = !!data.pendingChanges && Object.keys(data.pendingChanges).length > 0 && !confirmed;
  const pending = data.pendingChanges;

  return (
    <article className="profile-card" aria-label="Training program">
      {/* Header */}
      <header style={{ marginBottom: sp[8] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[1] }}>
          <h1 className="title" style={{ marginBottom: 0 }}>
            {hasPending && pending?.name
              ? <DiffValue current={program.name} pending={pending.name} />
              : program.name}
          </h1>
          {active
            ? <span className="badge badge-success">Active</span>
            : <span className="badge badge-muted">Inactive</span>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], flexWrap: "wrap" }}>
          {(hasPending && pending?.description !== undefined) ? (
            <span style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
              <DiffValue current={program.description} pending={pending.description} />
            </span>
          ) : program.description ? (
            <span style={{ fontSize: font.md, color: "var(--text-secondary)" }}>{program.description}</span>
          ) : null}
          <span style={{ fontSize: font.base, color: "var(--text-secondary)" }}>
            {program.days.length} days · {totalExercises} exercises
          </span>
        </div>
        {/* Day navigation: WeekdayPills if weekdays exist, otherwise DayTabs */}
        {program.days.length > 1 && (
          <nav style={{ marginTop: sp[4] }} aria-label="Program days navigation">
            {hasAnyWeekdays ? (
              <WeekdayPills days={program.days} highlightedDays={viewingWeekdays} onDayClick={goTo} />
            ) : (
              <DayTabs days={program.days} activeIdx={viewingIdx} goTo={goTo} />
            )}
          </nav>
        )}
      </header>

      {/* Day content panel */}
      <div
        role="tabpanel"
        id={`day-panel-${viewingIdx}`}
        aria-labelledby={`day-tab-${viewingIdx}`}
      >
        {program.days.length === 1
          ? <DayCard day={program.days[0]} alwaysExpanded />
          : <DayCarousel days={program.days} activeIdx={viewingIdx} goTo={goTo} />
        }
      </div>

      {/* Confirm bar */}
      {hasPending && (
        <ConfirmBar onConfirm={handleConfirm} confirming={confirming} confirmed={confirmed} />
      )}
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
