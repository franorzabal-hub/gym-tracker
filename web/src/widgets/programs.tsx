import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  ProgramEditor,
  type Program,
  type ExerciseSuggestion,
} from "./shared/program-editor.js";

function ProgramsWidget() {
  const data = useToolOutput<{ program: Program; initialDayIdx?: number; exerciseCatalog?: ExerciseSuggestion[] }>();

  if (!data) return <div className="loading">Loading...</div>;
  if (!data.program) return <div className="empty">No program found</div>;

  return (
    <ProgramEditor
      program={data.program}
      exerciseCatalog={data.exerciseCatalog}
      initialDayIdx={data.initialDayIdx}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
