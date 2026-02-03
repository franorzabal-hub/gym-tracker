import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool, useWidgetState } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font } from "../tokens.js";
import "../styles.css";
import { type Program, ProgramView } from "./shared/program-view.js";

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
  program: Program;
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
  const [localProgram, setLocalProgram] = useState<Program | null>(null);

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
  const hasPending = !!data.pendingChanges && Object.keys(data.pendingChanges).length > 0 && !confirmed;
  const pending = data.pendingChanges;

  return (
    <div className="profile-card">
      <ProgramView
        program={program}
        viewingIdx={viewingIdx}
        onDayChange={goTo}
        isMainHeading
        renderTitle={hasPending && pending?.name
          ? () => <DiffValue current={program.name} pending={pending.name} />
          : undefined
        }
        renderDescription={hasPending && pending?.description !== undefined
          ? () => (
              <span style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
                <DiffValue current={program.description} pending={pending.description} />
              </span>
            )
          : undefined
        }
      />
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
