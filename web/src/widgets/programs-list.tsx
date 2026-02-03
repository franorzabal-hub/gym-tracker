import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, maxWidth } from "../tokens.js";
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

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        onDot(Math.min(active + 1, total - 1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        onDot(Math.max(active - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        onDot(0);
        break;
      case "End":
        e.preventDefault();
        onDot(total - 1);
        break;
    }
  };

  return (
    <nav
      role="tablist"
      aria-label="Programs navigation"
      onKeyDown={handleKeyDown}
      style={{ display: "flex", gap: sp[3], justifyContent: "center", padding: `${sp[5]}px 0` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          role="tab"
          aria-selected={i === active}
          aria-label={`Program ${i + 1} of ${total}`}
          tabIndex={i === active ? 0 : -1}
          onClick={() => onDot(i)}
          style={{
            width: i === active ? 18 : 8,
            height: 8,
            borderRadius: radius.sm,
            background: i === active ? "var(--primary)" : "var(--border)",
            cursor: "pointer",
            transition: "all 0.2s",
            boxSizing: "content-box",
            border: `${sp[5]}px solid transparent`,
            padding: 0,
          }}
        />
      ))}
    </nav>
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
  const hasAnyWeekdays = program.days.some(d => d.weekdays && d.weekdays.length > 0);

  return (
    <article aria-label={`Program: ${program.name}`}>
      {/* Header */}
      <header style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[0.5] }}>
          <h2 className="title" style={{ marginBottom: 0 }}>{program.name}</h2>
          {program.is_active
            ? <span className="badge badge-success">Active</span>
            : <span className="badge badge-muted">Inactive</span>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], flexWrap: "wrap" }}>
          {program.description && (
            <span style={{ fontSize: font.base, color: "var(--text-secondary)" }}>{program.description}</span>
          )}
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {program.days.length} days · {totalExercises} exercises
          </span>
        </div>
        {hasAnyWeekdays && (
          <nav style={{ marginTop: sp[4] }} aria-label="Program days">
            <WeekdayPills days={program.days} highlightedDays={viewingWeekdays} onDayClick={goTo} />
          </nav>
        )}
      </header>

      {/* Days content */}
      <section aria-label="Day exercises">
        {program.days.length === 1
          ? <DayCard day={program.days[0]} alwaysExpanded />
          : <DayCarousel days={program.days} activeIdx={viewingIdx} goTo={goTo} />
        }
      </section>
    </article>
  );
}

// ── Skeleton loading state ──

function SkeletonProgramsList() {
  return (
    <div className="profile-card" role="status" aria-label="Loading programs">
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 160, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 60, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 120, height: font.sm, marginBottom: sp[4] }} />
        {/* Weekday pills skeleton */}
        <div style={{ display: "flex", gap: sp[2] }}>
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="skeleton" style={{ width: 24, height: 24, borderRadius: radius.full }} />
          ))}
        </div>
      </div>
      {/* Day content skeleton */}
      <div>
        <div className="skeleton" style={{ width: 140, height: font.xl, marginBottom: sp[3] }} />
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[3] }}>
            <div className="skeleton" style={{ width: `${35 + i * 8}%`, height: font.lg }} />
            <div className="skeleton" style={{ width: 70, height: font.md }} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading programs...</span>
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

  if (!data) return <SkeletonProgramsList />;

  if (programs.length === 0) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <p style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[8]}px 0` }}>
          No programs yet — describe your ideal routine in the chat, or ask me to show available programs.
        </p>
      </div>
    );
  }

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="region"
      aria-label="Your programs"
    >
      {/* Grid stacks all programs in the same cell — container takes the tallest height */}
      <div style={{ display: "grid" }} role="tabpanel" aria-live="polite">
        {programs.map((prog, i) => (
          <div
            key={prog.id}
            style={{
              gridRow: 1,
              gridColumn: 1,
              visibility: i === activeIdx ? "visible" : "hidden",
              pointerEvents: i === activeIdx ? "auto" : "none",
            }}
            aria-hidden={i !== activeIdx}
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
