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

interface UserProgram {
  id: number;
  name: string;
  is_active: boolean;
  description: string | null;
  version: number;
  days: Day[];
}

interface GlobalProgram {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days_per_week: number;
  days: Day[];
}

interface ProgramsListData {
  profile: Record<string, any>;
  programs: UserProgram[];
  globalPrograms: GlobalProgram[];
}

// A unified "page" in the carousel
type CarouselPage =
  | { type: "program"; program: UserProgram }
  | { type: "global"; program: GlobalProgram; recommended: boolean }
  | { type: "custom" };

// ── Dot indicators ──

function DotIndicator({ total, active, onDot }: { total: number; active: number; onDot: (i: number) => void }) {
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

// ── Page renderers ──

function ProgramPage({ program, loading, onActivate }: {
  program: UserProgram;
  loading: boolean;
  onActivate: () => void;
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
          {program.is_active && <span className="badge badge-success">Active</span>}
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

      {/* Activate button for inactive programs */}
      {!program.is_active && (
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
          disabled={loading}
          onClick={onActivate}
        >
          {loading ? "..." : "Activate"}
        </button>
      )}
    </div>
  );
}

function GlobalProgramPage({ program, recommended, loading, onClone }: {
  program: GlobalProgram;
  recommended: boolean;
  loading: boolean;
  onClone: () => void;
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
          {recommended && <span className="badge badge-primary">Recommended</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {shortDesc && (
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{shortDesc}.</span>
          )}
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {program.days_per_week}x/week &middot; {totalExercises} exercises
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

      {/* Clone button */}
      <button
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
        disabled={loading}
        onClick={onClone}
      >
        {loading ? "Creating..." : "Use this program"}
      </button>
    </div>
  );
}

function CustomPage() {
  return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Custom program</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 280, margin: "0 auto" }}>
        Describe your ideal program in the chat and I'll build it for you.
      </div>
    </div>
  );
}

// ── Root widget ──

function ProgramsListWidget() {
  const data = useToolOutput<ProgramsListData>();
  const { callTool, loading, error } = useCallTool();
  const [activeIdx, setActiveIdx] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const profile = data?.profile ?? {};
  const programs = data?.programs ?? [];
  const globalPrograms = data?.globalPrograms ?? [];

  // Build recommendation: match by days_per_week closest to user's training days
  const userDays = profile.training_days_per_week || 4;
  const recommendedId = (() => {
    if (!globalPrograms.length) return null;
    const sorted = [...globalPrograms].sort((a, b) =>
      Math.abs(a.days_per_week - userDays) - Math.abs(b.days_per_week - userDays)
    );
    return sorted[0]?.id || null;
  })();

  // Build pages
  const pages: CarouselPage[] = [
    ...programs.map(p => ({ type: "program" as const, program: p })),
    ...globalPrograms.map(p => ({ type: "global" as const, program: p, recommended: p.id === recommendedId })),
    { type: "custom" as const },
  ];

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, pages.length - 1)));
  }, [pages.length]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      goTo(activeIdx + (dx < 0 ? 1 : -1));
    }
  }, [activeIdx, goTo]);

  if (!data) return <div className="loading">Loading...</div>;

  // Success state
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

  const page = pages[activeIdx];

  const handleCloneGlobal = async (programId: number, programName: string) => {
    setActionId(`clone-${programId}`);
    const result = await callTool("manage_program", { action: "clone", source_id: programId });
    if (result) {
      setCreatedName(programName);
    }
    setActionId(null);
  };

  const handleActivate = async (programName: string) => {
    setActionId(`activate-${programName}`);
    await callTool("manage_program", { action: "activate", name: programName });
    setActionId(null);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      {/* Swipeable page */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {page.type === "program" && (
          <ProgramPage
            program={page.program}
            loading={loading && actionId === `activate-${page.program.name}`}
            onActivate={() => handleActivate(page.program.name)}
          />
        )}
        {page.type === "global" && (
          <GlobalProgramPage
            program={page.program}
            recommended={page.recommended}
            loading={loading && actionId === `clone-${page.program.id}`}
            onClone={() => handleCloneGlobal(page.program.id, page.program.name)}
          />
        )}
        {page.type === "custom" && <CustomPage />}
      </div>

      {/* Dot navigation */}
      {pages.length > 1 && (
        <DotIndicator total={pages.length} active={activeIdx} onDot={goTo} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
