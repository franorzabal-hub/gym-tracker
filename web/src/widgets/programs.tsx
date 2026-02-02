import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight } from "../tokens.js";
import "../styles.css";
import {
  type Day,
  WeekdayPills,
  DayCard,
  DayCarousel,
} from "./shared/program-view.js";

/** Day navigation tabs — always visible when multiple days exist */
function DayTabs({ days, activeIdx, goTo }: { days: Day[]; activeIdx: number; goTo: (idx: number) => void }) {
  return (
    <div style={{
      display: "flex",
      gap: sp[2],
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
      scrollbarWidth: "none",
      paddingBottom: sp[2],
    }}>
      {days.map((day, i) => {
        const isActive = i === activeIdx;
        // Extract short label: "Día 1" from "Día 1 — Peso Muerto + Push Pecho"
        const shortLabel = day.day_label.split(/\s*[—–-]\s*/)[0] || `Day ${i + 1}`;
        return (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              padding: `${sp[2]}px ${sp[5]}px`,
              borderRadius: radius.lg,
              border: isActive ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
              background: isActive ? "var(--primary)" : "transparent",
              color: isActive ? "var(--card-bg, var(--bg))" : "var(--text-secondary)",
              fontSize: font.sm,
              fontWeight: isActive ? weight.semibold : weight.normal,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.15s ease",
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
    <div className="profile-confirm-bar">
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
  );
}

function ProgramsWidget() {
  const data = useToolOutput<ToolData>();
  const { callTool } = useCallTool();
  const [viewingIdx, setViewingIdx] = useState(data?.initialDayIdx || 0);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [localProgram, setLocalProgram] = useState<ProgramData | null>(null);

  const daysLen = data?.program?.days?.length ?? 0;

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
    setViewingIdx(Math.max(0, Math.min(idx, daysLen - 1)));
  }, [daysLen]);

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
      <div style={{ marginBottom: sp[6] }}>
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
        {hasAnyWeekdays && (
          <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginTop: sp[4] }}>
            <WeekdayPills days={program.days} highlightedDays={viewingWeekdays} onDayClick={goTo} />
          </div>
        )}
        {program.days.length > 1 && (
          <div style={{ marginTop: sp[4] }}>
            <DayTabs days={program.days} activeIdx={viewingIdx} goTo={goTo} />
          </div>
        )}
      </div>

      {/* Days */}
      {program.days.length === 1
        ? <DayCard day={program.days[0]} alwaysExpanded />
        : <DayCarousel days={program.days} activeIdx={viewingIdx} goTo={goTo} />
      }

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
