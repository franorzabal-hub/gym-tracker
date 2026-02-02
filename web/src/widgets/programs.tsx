import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  type Day,
  WeekdayPills,
  DayCard,
  DayCarousel,
} from "./shared/program-view.js";

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

  const hasPending = !!data.pendingChanges && Object.keys(data.pendingChanges).length > 0 && !confirmed;
  const pending = data.pendingChanges;

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {(hasPending && pending?.description !== undefined) ? (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              <DiffValue current={program.description} pending={pending.description} />
            </span>
          ) : program.description ? (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{program.description}</span>
          ) : null}
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {program.days.length} days &middot; {totalExercises} exercises
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <WeekdayPills days={program.days} viewingWeekdays={viewingWeekdays} onWeekdayClick={goTo} />
        </div>
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
