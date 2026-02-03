import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, font, weight } from "../tokens.js";
import {
  SessionData,
  SessionDisplay,
  SkeletonWorkout,
} from "./shared/session-view.js";
import "../styles.css";

// ── Types ──

interface ToolData {
  session: SessionData | null;
  readonly?: boolean;
}

// ── Main widget ──

function WorkoutWidget() {
  const data = useToolOutput<ToolData>();

  if (!data) return <SkeletonWorkout />;

  if (!data.session) {
    return (
      <div className="empty" style={{ padding: `${sp[16]}px ${sp[8]}px` }} role="status">
        <div style={{ fontSize: font["2xl"], fontWeight: weight.medium, marginBottom: sp[4] }}>No workouts yet</div>
        <div style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
          Start your first session to begin tracking your exercises here.
        </div>
      </div>
    );
  }

  return <SessionDisplay session={data.session} readonly={data.readonly} />;
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
