import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  ProgramEditor,
  type Program,
  type ExerciseSuggestion,
} from "./shared/program-editor.js";

interface UserProgram extends Program {
  is_active: boolean;
}

interface ProgramsListData {
  programs: UserProgram[];
  exerciseCatalog?: ExerciseSuggestion[];
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

// ── Root widget ──

function ProgramsListWidget() {
  const data = useToolOutput<ProgramsListData>();
  const { callTool, loading } = useCallTool();
  const [activeIdx, setActiveIdx] = useState(0);
  const [activatingName, setActivatingName] = useState<string | null>(null);

  const programs = data?.programs ?? [];
  const catalog = data?.exerciseCatalog ?? [];

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

  const currentProgram = programs[activeIdx];

  const handleActivate = async (programName: string) => {
    setActivatingName(programName);
    await callTool("manage_program", { action: "activate", name: programName });
    setActivatingName(null);
  };

  const activeBadge = currentProgram.is_active ? (
    <span className="badge badge-success">Active</span>
  ) : null;

  return (
    <div style={{ maxWidth: 600 }}>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <ProgramEditor
          key={currentProgram.id}
          program={currentProgram}
          exerciseCatalog={catalog}
          badge={activeBadge}
        />

        {/* Activate button for inactive programs */}
        {!currentProgram.is_active && (
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            disabled={loading && activatingName === currentProgram.name}
            onClick={() => handleActivate(currentProgram.name)}
          >
            {loading && activatingName === currentProgram.name ? "..." : "Activate"}
          </button>
        )}
      </div>

      <DotIndicator total={programs.length} active={activeIdx} onDot={goTo} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
