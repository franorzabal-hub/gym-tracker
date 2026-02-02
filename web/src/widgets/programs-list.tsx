import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  ProgramEditor,
  type Program,
  type ExerciseSuggestion,
  type ProgramMenuItem,
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

// ── Root widget ──

function ProgramsListWidget() {
  const data = useToolOutput<ProgramsListData>();
  const { callTool, loading } = useCallTool();
  const [activeIdx, setActiveIdx] = useState(0);
  const [activatingName, setActivatingName] = useState<string | null>(null);
  const [localPrograms, setLocalPrograms] = useState<UserProgram[] | null>(null);

  const programs = localPrograms ?? data?.programs ?? [];
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

  const handleActivate = async (programName: string) => {
    setActivatingName(programName);
    const result = await callTool("manage_program", { action: "activate", name: programName });
    setActivatingName(null);
    if (result && !result.error) {
      setLocalPrograms(programs.map((p) => ({ ...p, is_active: p.name === programName })));
    }
  };

  const handleDelete = async (programName: string) => {
    const result = await callTool("manage_program", { action: "delete", name: programName });
    if (result && !result.error) {
      const remaining = programs.filter((p) => p.name !== programName);
      setLocalPrograms(remaining);
      if (activeIdx >= remaining.length) setActiveIdx(Math.max(0, remaining.length - 1));
    }
  };

  return (
    <div style={{ maxWidth: 600 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Grid stacks all programs in the same cell — container takes the tallest height */}
      <div style={{ display: "grid" }}>
        {programs.map((prog, i) => {
          const menu: ProgramMenuItem[] = [];
          if (!prog.is_active) {
            menu.push({
              label: loading && activatingName === prog.name ? "Activating..." : "Activate",
              icon: "✦",
              disabled: loading && activatingName === prog.name,
              onClick: () => handleActivate(prog.name),
            });
          }
          menu.push({
            label: "Delete",
            icon: "×",
            danger: true,
            onClick: () => handleDelete(prog.name),
          });

          return (
            <div
              key={prog.id}
              style={{
                gridRow: 1,
                gridColumn: 1,
                visibility: i === activeIdx ? "visible" : "hidden",
                pointerEvents: i === activeIdx ? "auto" : "none",
              }}
            >
              <ProgramEditor
                program={prog}
                exerciseCatalog={catalog}
                badge={
                  prog.is_active
                    ? <span className="badge badge-success">Active</span>
                    : <span className="badge badge-muted">Inactive</span>
                }
                menuItems={menu}
              />
            </div>
          );
        })}
      </div>

      <DotIndicator total={programs.length} active={activeIdx} onDot={goTo} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
