import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  type Day,
  WeekdayPills,
  DayCard,
  DayCarousel,
} from "./shared/program-view.js";

interface UserProgram {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days: Day[];
  is_active: boolean;
}

interface ProgramsListData {
  programs: UserProgram[];
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
            boxSizing: "content-box",
            border: "10px solid transparent",
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

function ProgramCard({ program }: { program: UserProgram }) {
  const [viewingIdx, setViewingIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    setViewingIdx(Math.max(0, Math.min(idx, program.days.length - 1)));
  }, [program.days.length]);

  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const viewingWeekdays = program.days[viewingIdx]?.weekdays || [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div className="title" style={{ marginBottom: 0 }}>{program.name}</div>
          {program.is_active
            ? <span className="badge badge-success">Active</span>
            : <span className="badge badge-muted">Inactive</span>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {program.description && (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{program.description}</span>
          )}
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
    </div>
  );
}

// ── Root widget ──

function ProgramsListWidget() {
  const data = useToolOutput<ProgramsListData>();
  const [activeIdx, setActiveIdx] = useState(0);

  const programs = data?.programs ?? [];

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, programs.length - 1)));
  }, [programs.length]);

  const { onTouchStart, onTouchEnd } = useSwipe((dir) => goTo(activeIdx + dir));

  if (!data) return <div className="loading">Loading...</div>;

  if (programs.length === 0) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "16px 0" }}>
          No programs yet — describe your ideal routine in the chat, or ask me to show available programs.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Grid stacks all programs in the same cell — container takes the tallest height */}
      <div style={{ display: "grid" }}>
        {programs.map((prog, i) => (
          <div
            key={prog.id}
            style={{
              gridRow: 1,
              gridColumn: 1,
              visibility: i === activeIdx ? "visible" : "hidden",
              pointerEvents: i === activeIdx ? "auto" : "none",
            }}
          >
            <ProgramCard program={prog} />
          </div>
        ))}
      </div>

      <DotIndicator total={programs.length} active={activeIdx} onDot={goTo} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
