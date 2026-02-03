import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, maxWidth } from "../tokens.js";
import "../styles.css";
import { type Program, ProgramView, ProgramTabs } from "./shared/program-view.js";

interface GlobalProgram extends Program {
  days_per_week: number;
}

interface AvailableProgramsData {
  profile: Record<string, any>;
  globalPrograms: GlobalProgram[];
  clonedNames: string[];
}

// ── Program card using shared ProgramView ──

function ProgramCard({ program, badge, actionLabel, actionVariant, loading, onAction }: {
  program: GlobalProgram;
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

      {/* Action button */}
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

function SkeletonAvailablePrograms() {
  return (
    <div className="profile-card" role="status" aria-label="Loading programs">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[4], marginBottom: sp[6] }}>
        <div className="skeleton" style={{ width: 140, height: font.lg }} />
        <div className="skeleton" style={{ width: 20, height: font.sm }} />
      </div>
      {/* Tabs skeleton */}
      <div style={{ display: "flex", gap: sp[2], borderBottom: "1px solid var(--border)", paddingBottom: sp[3], marginBottom: sp[6] }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ width: 80, height: 24, borderRadius: radius.sm }} />
        ))}
      </div>
      {/* Program content */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 160, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 80, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 200, height: font.sm, marginBottom: sp[4] }} />
      </div>
      <div>
        <div className="skeleton" style={{ width: 140, height: font.xl, marginBottom: sp[3] }} />
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[3] }}>
            <div className="skeleton" style={{ width: `${35 + i * 8}%`, height: font.lg }} />
            <div className="skeleton" style={{ width: 70, height: font.md }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ width: "100%", height: 40, borderRadius: radius.md, marginTop: sp[6] }} />
      <span className="sr-only">Loading available programs...</span>
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

  if (!data) return <SkeletonAvailablePrograms />;

  // Success state after clone
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

  if (globalPrograms.length === 0) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <p style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[8]}px 0` }}>
          No available programs found.
        </p>
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
  const isCloned = clonedNamesLower.includes(globalProgram.name.toLowerCase());
  const isRecommended = globalProgram.id === recommendedId;

  const badge = isCloned
    ? <span className="badge badge-muted">Already added</span>
    : isRecommended
      ? <span className="badge badge-primary">Recommended</span>
      : null;

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label="Available programs"
    >
      {error && <div style={{ color: "var(--danger)", fontSize: font.base, marginBottom: sp[4] }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "baseline", gap: sp[4], marginBottom: sp[4] }}>
        <span style={{ fontSize: font.lg, fontWeight: 700, color: "var(--text)" }}>Available Programs</span>
        <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>{globalPrograms.length}</span>
      </div>

      {/* Program tabs */}
      <ProgramTabs programs={globalPrograms} activeIdx={globalIdx} goTo={goToGlobal} />

      {/* Active program content */}
      <div role="tabpanel" id={`program-panel-${globalIdx}`} aria-live="polite">
        <ProgramCard
          program={globalProgram}
          badge={badge}
          actionLabel={isCloned ? undefined : "Use this program"}
          actionVariant="primary"
          loading={loading && actionId === `clone-${globalProgram.id}`}
          onAction={isCloned ? undefined : () => handleCloneGlobal(globalProgram.id, globalProgram.name)}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><AvailableProgramsWidget /></AppProvider>
);
