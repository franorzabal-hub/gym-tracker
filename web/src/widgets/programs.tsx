import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput } from "../hooks.js";
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

function ProgramsWidget() {
  const data = useToolOutput<{ program: ProgramData; initialDayIdx?: number }>();
  const [viewingIdx, setViewingIdx] = useState(data?.initialDayIdx || 0);

  if (!data) return <div className="loading">Loading...</div>;
  if (!data.program) return <div className="empty">No program found</div>;

  const program = data.program;
  const active = program.is_active ?? false;
  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const viewingWeekdays = program.days[viewingIdx]?.weekdays || [];

  const goTo = useCallback((idx: number) => {
    setViewingIdx(Math.max(0, Math.min(idx, program.days.length - 1)));
  }, [program.days.length]);

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div className="title" style={{ marginBottom: 0 }}>{program.name}</div>
          {active
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

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
