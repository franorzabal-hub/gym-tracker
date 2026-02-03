import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, maxWidth } from "../tokens.js";
import "../styles.css";
import { type Program, ProgramView, ProgramTabs } from "./shared/program-view.js";

interface ProgramsListData {
  programs: Program[];
}

// ── Program card using shared ProgramView ──

function ProgramCard({ program }: { program: Program }) {
  const [viewingIdx, setViewingIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    setViewingIdx(Math.max(0, Math.min(idx, program.days.length - 1)));
  }, [program.days.length]);

  return (
    <ProgramView
      program={program}
      viewingIdx={viewingIdx}
      onDayChange={goTo}
    />
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
  const [activeIdx, setActiveIdx] = useState(0);

  const programs = data?.programs ?? [];

  const goTo = useCallback((idx: number) => {
    setActiveIdx(Math.max(0, Math.min(idx, programs.length - 1)));
  }, [programs.length]);

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

  const activeProgram = programs[activeIdx];

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label="Your programs"
    >
      {/* Program tabs */}
      <ProgramTabs programs={programs} activeIdx={activeIdx} goTo={goTo} />

      {/* Active program content */}
      <div role="tabpanel" id={`program-panel-${activeIdx}`} aria-live="polite">
        <ProgramCard program={activeProgram} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProgramsListWidget /></AppProvider>
);
