import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  type Day,
  WeekdayPills,
  DayCard,
  DayCarousel,
} from "./shared/program-view.js";

interface GlobalProgram {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days_per_week: number;
  days: Day[];
}

interface AvailableProgramsData {
  profile: Record<string, any>;
  globalPrograms: GlobalProgram[];
  clonedNames: string[];
}

// ── Dot indicators ──

function DotIndicator({ total, active, onDot }: { total: number; active: number; onDot: (i: number) => void }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "10px 0" }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          onClick={() => onDot(i)}
          style={{
            width: i === active ? 18 : 8,
            height: 8,
            borderRadius: 4,
            background: i === active ? "var(--primary)" : "var(--border)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        />
      ))}
    </div>
  );
}

// ── Swipe hook ──

function useSwipe(onSwipe: (dir: -1 | 1) => void) {
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  }, [onSwipe]);

  return { onTouchStart, onTouchEnd };
}

// ── Read-only program card ──

function ProgramCard({ program, badge, actionLabel, actionVariant, loading, onAction }: {
  program: GlobalProgram;
  badge?: { label: string; className: string } | null;
  actionLabel?: string;
  actionVariant?: "primary" | "default";
  loading?: boolean;
  onAction?: () => void;
}) {
  const [viewingIdx, setViewingIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    setViewingIdx(Math.max(0, Math.min(idx, program.days.length - 1)));
  }, [program.days.length]);

  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const shortDesc = program.description?.split(/\.\s/)[0]?.trim();
  const viewingWeekdays = program.days[viewingIdx]?.weekdays || [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div className="title" style={{ marginBottom: 0 }}>{program.name}</div>
          {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {shortDesc && (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{shortDesc}.</span>
          )}
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {program.days.length} days &middot; {totalExercises} exercises
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <WeekdayPills days={program.days} viewingWeekdays={viewingWeekdays} onWeekdayClick={goTo} />
        </div>
      </div>

      {/* Full program view */}
      {program.days.length === 1
        ? <DayCard day={program.days[0]} alwaysExpanded />
        : <DayCarousel days={program.days} activeIdx={viewingIdx} goTo={goTo} />
      }

      {/* Action button */}
      {actionLabel && onAction && (
        <button
          className={`btn ${actionVariant === "primary" ? "btn-primary" : ""}`}
          style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
          disabled={loading}
          onClick={onAction}
        >
          {loading ? "..." : actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Root widget ──

function AvailableProgramsWidget() {
  const data = useToolOutput<AvailableProgramsData>();
  const { callTool, loading, error } = useCallTool();
  const [globalIdx, setGlobalIdx] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const profile = data?.profile ?? {};
  const globalPrograms = data?.globalPrograms ?? [];
  const clonedNames = data?.clonedNames ?? [];
  const clonedNamesLower = clonedNames.map((n) => n.toLowerCase());

  // Recommendation: closest days_per_week match
  const userDays = profile.training_days_per_week || 4;
  const recommendedId = (() => {
    if (!globalPrograms.length) return null;
    const sorted = [...globalPrograms].sort((a, b) =>
      Math.abs(a.days_per_week - userDays) - Math.abs(b.days_per_week - userDays)
    );
    return sorted[0]?.id || null;
  })();

  const goToGlobal = useCallback((idx: number) => {
    setGlobalIdx(Math.max(0, Math.min(idx, globalPrograms.length - 1)));
  }, [globalPrograms.length]);

  const { onTouchStart, onTouchEnd } = useSwipe((dir) => goToGlobal(globalIdx + dir));

  if (!data) return <div className="loading">Loading...</div>;

  // Success state after clone
  if (createdName) {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--success)", color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 700, marginBottom: 12,
        }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Program created!</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          "{createdName}" is ready. Start training by telling me what you want to do.
        </div>
      </div>
    );
  }

  if (globalPrograms.length === 0) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
          No available programs found.
        </div>
      </div>
    );
  }

  const handleCloneGlobal = async (programId: number, programName: string) => {
    setActionId(`clone-${programId}`);
    const result = await callTool("manage_program", { action: "clone", source_id: programId });
    if (result) {
      setCreatedName(programName);
    }
    setActionId(null);
  };

  const globalProgram = globalPrograms[globalIdx];

  return (
    <div style={{ maxWidth: 600 }}>
      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Available Programs</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{globalPrograms.length}</span>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {globalProgram && (() => {
          const isCloned = clonedNamesLower.includes(globalProgram.name.toLowerCase());
          const isRecommended = globalProgram.id === recommendedId;

          const badge = isCloned
            ? { label: "Already added", className: "badge-muted" }
            : isRecommended
              ? { label: "Recommended", className: "badge-primary" }
              : null;

          return (
            <ProgramCard
              program={globalProgram}
              badge={badge}
              actionLabel={isCloned ? undefined : "Use this program"}
              actionVariant="primary"
              loading={loading && actionId === `clone-${globalProgram.id}`}
              onAction={isCloned ? undefined : () => handleCloneGlobal(globalProgram.id, globalProgram.name)}
            />
          );
        })()}
      </div>

      <DotIndicator total={globalPrograms.length} active={globalIdx} onDot={goToGlobal} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><AvailableProgramsWidget /></AppProvider>
);
