import { createRoot } from "react-dom/client";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import "../styles.css";

interface ExercisePlan {
  name: string;
  target_sets: number;
  target_reps: string | number;
  target_weight?: number | null;
  target_rpe?: number | null;
  muscle_group?: string | null;
  notes?: string | null;
}

interface LastSet {
  reps: number;
  weight?: number | null;
}

interface LastExercise {
  name: string;
  sets?: LastSet[];
}

interface PlanData {
  rest_day?: boolean;
  message?: string;
  day?: string;
  program?: string;
  exercises?: ExercisePlan[];
  last_workout?: {
    date: string;
    exercises?: LastExercise[];
    total_volume?: number;
    duration_minutes?: number;
  };
}

function formatTarget(ex: ExercisePlan): string {
  const parts = [`${ex.target_sets}×${ex.target_reps}`];
  if (ex.target_weight) parts.push(`${ex.target_weight}kg`);
  if (ex.target_rpe) parts.push(`RPE ${ex.target_rpe}`);
  return parts.join(" @ ");
}

function TodayPlanWidget() {
  const data = useToolOutput<PlanData>();
  const { callTool, loading } = useCallTool();

  if (!data) return <div className="loading">Loading...</div>;

  if (data.rest_day) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="title">Rest Day</div>
        <div className="empty">{data.message || "No workout scheduled for today"}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{data.day}</div>
        {data.program && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{data.program}</div>
        )}
      </div>

      {/* Exercise list */}
      {data.exercises?.map((ex, i) => {
        const muscleColor = ex.muscle_group ? MUSCLE_COLOR[ex.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
        return (
          <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
            <ExerciseIcon name={ex.name} color={muscleColor} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatTarget(ex)}</div>
            </div>
            {ex.muscle_group && (
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 4,
                background: muscleColor + "18", color: muscleColor,
                fontWeight: 500, textTransform: "capitalize",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {ex.muscle_group}
              </span>
            )}
          </div>
        );
      })}

      {/* Last workout compact summary */}
      {data.last_workout && (
        <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "transparent" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 4 }}>
            Last session — {new Date(data.last_workout.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {data.last_workout.exercises?.map((ex, i) => {
              const bestSet = ex.sets?.reduce((best, s) => (s.weight ?? 0) > (best.weight ?? 0) ? s : best, ex.sets[0]);
              const summary = bestSet?.weight ? `${bestSet.weight}kg×${bestSet.reps}` : bestSet ? `${bestSet.reps}r` : "";
              return (
                <span key={i}>
                  {i > 0 && <span style={{ opacity: 0.4 }}> · </span>}
                  <span style={{ fontWeight: 500 }}>{ex.name}</span>
                  {summary && <span> {summary}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Start session button */}
      <button
        className="btn btn-primary"
        style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
        onClick={() => callTool("log_workout", {})}
        disabled={loading}
      >
        {loading ? "Starting..." : "Start Session"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><TodayPlanWidget /></AppProvider>
);
