import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, maxWidth } from "../tokens.js";
import "../styles.css";
import { type Program, ProgramView, ProgramTabs } from "./shared/program-view.js";

interface ExtendedProgram extends Program {
  days_per_week?: number;
}

interface ProgramsListData {
  mode: "user" | "available";
  programs: ExtendedProgram[];
  // Only for available mode:
  profile?: Record<string, any>;
  clonedNames?: string[];
}

// ── Program card using shared ProgramView ──

function ProgramCard({ program, badge, actionLabel, actionVariant, loading, onAction }: {
  program: ExtendedProgram;
  badge?: React.ReactNode;
  actionLabel?: string;
  actionVariant?: "primary" | "default";
  loading?: boolean;
  onAction?: () => void;
}) {
  const [viewingIdx, setViewingIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    setViewingIdx(Math.max(0, Math.min(idx, program.days.length - 1)));
  }, [program.days.length]);

  return (
    <div>
      <ProgramView
        program={program}
        viewingIdx={viewingIdx}
        onDayChange={goTo}
        badge={badge}
      />

      {/* Action button (available mode) */}
      {actionLabel && onAction && (
        <button
          className={`btn ${actionVariant === "primary" ? "btn-primary" : ""}`}
          style={{ width: "100%", justifyContent: "center", marginTop: sp[6] }}
          disabled={loading}
          onClick={onAction}
        >
          {loading ? "..." : actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Skeleton loading state ──

function SkeletonProgramsList() {
  return (
    <div className="profile-card" role="status" aria-label="Loading programs">
      {/* Tabs skeleton */}
      <div style={{ display: "flex", gap: sp[2], borderBottom: "1px solid var(--border)", paddingBottom: sp[3], marginBottom: sp[6] }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ width: 80, height: 24, borderRadius: radius.sm }} />
        ))}
      </div>
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 160, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 60, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 120, height: font.sm, marginBottom: sp[4] }} />
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
  const { callTool, loading, error } = useCallTool();
  const [activeIdx, setActiveIdx] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const mode = data?.mode ?? "user";
  const programs = data?.programs ?? [];
  const profile = data?.profile ?? {};
  const clonedNames = data?.clonedNames ?? [];
  const clonedNamesLower = clonedNames.map((n) => n.toLowerCase());

  // Recommendation: closest days_per_week match (available mode only)
  const userDays = profile.training_days_per_week || 4;
  const recommendedId = (() => {
    if (mode !== "available" || !programs.length) return null;
    const withDays = programs.filter(p => p.days_per_week != null);
    if (!withDays.length) return null;
    const sorted = [...withDays].sort((a, b) =>
      Math.abs((a.days_per_week ?? 0) - userDays) - Math.abs((b.days_per_week ?? 0) - userDays)
    );
    return sorted[0]?.id || null;
  })();

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, programs.length - 1)));
  }, [programs.length]);

  if (!data) return <SkeletonProgramsList />;

  // Success state after clone (available mode)
  if (createdName) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget, textAlign: "center", padding: `${sp[16]}px ${sp[8]}px` }}>
        <div style={{
          width: 48, height: 48, borderRadius: radius.full,
          background: "var(--success)", color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: font["2xl"], fontWeight: 700, marginBottom: sp[6],
        }} aria-hidden="true">✔</div>
        <div style={{ fontSize: font.lg, fontWeight: 600, marginBottom: sp[2] }}>Program created!</div>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)" }}>
          "{createdName}" is ready. Start training by telling me what you want to do.
        </div>
      </div>
    );
  }

  if (programs.length === 0) {
    const emptyMessage = mode === "available"
      ? "No available programs found."
      : "No programs yet — describe your ideal routine in the chat, or ask me to show available programs.";
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <p style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[8]}px 0` }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const handleClone = async (programId: number, programName: string) => {
    setActionId(`clone-${programId}`);
    const result = await callTool("manage_program", { action: "clone", source_id: programId });
    if (result) {
      setCreatedName(programName);
    }
    setActionId(null);
  };

  const activeProgram = programs[activeIdx];

  // Determine badge and action based on mode
  let badge: React.ReactNode = undefined;
  let actionLabel: string | undefined;
  let actionVariant: "primary" | "default" | undefined;
  let onAction: (() => void) | undefined;

  if (mode === "available") {
    const isCloned = clonedNamesLower.includes(activeProgram.name.toLowerCase());
    const isRecommended = activeProgram.id === recommendedId;

    badge = isCloned
      ? <span className="badge badge-muted">Already added</span>
      : isRecommended
        ? <span className="badge badge-primary">Recommended</span>
        : null;

    if (!isCloned) {
      actionLabel = "Use this program";
      actionVariant = "primary";
      onAction = () => handleClone(activeProgram.id, activeProgram.name);
    }
  }
  // user mode: no custom badge (ProgramView shows Active/Inactive)

  const regionLabel = mode === "available" ? "Available programs" : "Your programs";

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label={regionLabel}
    >
      {error && <div style={{ color: "var(--danger)", fontSize: font.base, marginBottom: sp[4] }}>{error}</div>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[4], marginBottom: sp[4] }}>
        <span style={{ fontSize: font.lg, fontWeight: 700, color: "var(--text)" }}>
          {mode === "available" ? "Available Programs" : "My Programs"}
        </span>
        <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>{programs.length}</span>
      </div>

      {/* Program tabs */}
      <ProgramTabs programs={programs} activeIdx={activeIdx} goTo={goTo} />

      {/* Active program content */}
      <div role="tabpanel" id={`program-panel-${activeIdx}`} aria-live="polite">
        <ProgramCard
          program={activeProgram}
          badge={badge}
          actionLabel={actionLabel}
          actionVariant={actionVariant}
          loading={loading && actionId === `clone-${activeProgram.id}`}
          onAction={onAction}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
