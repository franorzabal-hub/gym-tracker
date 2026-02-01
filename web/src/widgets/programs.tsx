import { createRoot } from "react-dom/client";
import { useState } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  ProgramEditor,
  type Program,
  type ExerciseSuggestion,
  type ProgramMenuItem,
} from "./shared/program-editor.js";

interface ProgramData extends Program {
  is_active?: boolean;
}

function ProgramsWidget() {
  const data = useToolOutput<{ program: ProgramData; initialDayIdx?: number; exerciseCatalog?: ExerciseSuggestion[] }>();
  const { callTool, loading } = useCallTool();
  const [isActive, setIsActive] = useState<boolean | null>(null);

  if (!data) return <div className="loading">Loading...</div>;
  if (!data.program) return <div className="empty">No program found</div>;

  const active = isActive ?? data.program.is_active ?? false;

  const menu: ProgramMenuItem[] = [];
  if (!active) {
    menu.push({
      label: loading ? "Activating..." : "Activate",
      icon: "✦",
      disabled: loading,
      onClick: async () => {
        const result = await callTool("manage_program", { action: "activate", name: data.program.name });
        if (result && !result.error) setIsActive(true);
      },
    });
  }
  menu.push({
    label: "Delete",
    icon: "×",
    danger: true,
    onClick: () => callTool("manage_program", { action: "delete", name: data.program.name }),
  });

  return (
    <ProgramEditor
      program={data.program}
      exerciseCatalog={data.exerciseCatalog}
      initialDayIdx={data.initialDayIdx}
      badge={
        active
          ? <span className="badge badge-success">Active</span>
          : <span className="badge badge-muted">Inactive</span>
      }
      menuItems={menu}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
