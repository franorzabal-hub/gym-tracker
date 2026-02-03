import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef, KeyboardEvent } from "react";
import { useToolOutput, useCallTool, useWidgetState } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, font, weight } from "../tokens.js";
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
    <div className="confirm-bar-sticky">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {confirmed ? (
          <span className="profile-confirm-flash">Updated</span>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={confirming}
            role="button"
            aria-label="Confirm program changes"
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

  if (!data) return <div className="loading">Loading...</div>;
  if (!data.program) return <div className="empty">No program found</div>;

  const program = localProgram || data.program;
  const active = program.is_active ?? false;
  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const viewingWeekdays = program.days[viewingIdx]?.weekdays || [];

  const hasAnyWeekdays = program.days.some(d => d.weekdays && d.weekdays.length > 0);
  const hasPending = !!data.pendingChanges && Object.keys(data.pendingChanges).length > 0 && !confirmed;
  const pending = data.pendingChanges;

  return (
    <div className="profile-card">
      {/* Header */}
      <div style={{ marginBottom: sp[8] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[1] }}>
          <div className="title" style={{ marginBottom: 0 }}>
            {hasPending && pending?.name
              ? <DiffValue current={program.name} pending={pending.name} />
              : program.name}
          </div>
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
            {program.days.length} days &middot; {totalExercises} exercises
          </span>
        </div>
        {/* Day navigation: WeekdayPills if weekdays exist, otherwise DayTabs */}
        {program.days.length > 1 && (
          <div style={{ marginTop: sp[4] }}>
            {hasAnyWeekdays ? (
              <WeekdayPills days={program.days} highlightedDays={viewingWeekdays} onDayClick={goTo} />
            ) : (
              <DayTabs days={program.days} activeIdx={viewingIdx} goTo={goTo} />
            )}
          </div>
        )}
      </div>

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
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
