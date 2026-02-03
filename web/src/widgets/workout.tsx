import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
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
  const { callTool } = useCallTool();
  const [validating, setValidating] = useState(false);
  const [localValidated, setLocalValidated] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!data?.session) return;
    setValidating(true);
    const result = await callTool("edit_log", { validate_session: data.session.session_id });
    setValidating(false);
    if (result) {
      setLocalValidated(true);
    }
  }, [data, callTool]);

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

  // Apply local validation state if user just validated
  const session = localValidated
    ? { ...data.session, is_validated: true }
    : data.session;

  return (
    <SessionDisplay
      session={session}
      readonly={data.readonly}
      onValidate={data.session.is_validated === false ? handleValidate : undefined}
      validating={validating}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
