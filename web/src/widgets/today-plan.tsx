import { createRoot } from "react-dom/client";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import { sp, font, weight, radius, maxWidth, opacity } from "../tokens.js";
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
      <div style={{ maxWidth: maxWidth.widget }}>
        <div className="title">Rest Day</div>
        <div className="empty">{data.message || "No workout scheduled for today"}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: maxWidth.widget }}>
      {/* Header */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.lg }}>{data.day}</div>
        {data.program && (
          <div style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[1] }}>{data.program}</div>
        )}
      </div>

      {/* Exercise list */}
      {data.exercises?.map((ex, i) => {
        const muscleColor = ex.muscle_group ? MUSCLE_COLOR[ex.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
        return (
          <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: sp[4], padding: `${sp[5]}px ${sp[6]}px` }}>
            <ExerciseIcon name={ex.name} color={muscleColor} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: weight.semibold, fontSize: font.base }}>{ex.name}</div>
              <div style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>{formatTarget(ex)}</div>
            </div>
            {ex.muscle_group && (
              <span style={{
                fontSize: font["2xs"], padding: `${sp[0.5]}px ${sp[2]}px`, borderRadius: radius.xs,
                background: muscleColor + "18", color: muscleColor,
                fontWeight: weight.medium, textTransform: "capitalize",
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
        <div style={{ marginTop: sp[6], padding: `${sp[4]}px ${sp[6]}px`, borderRadius: radius.md, border: "1px solid var(--border)", background: "transparent" }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: sp[2] }}>
            Last session — {new Date(data.last_workout.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <div style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {data.last_workout.exercises?.map((ex, i) => {
              const bestSet = ex.sets?.reduce((best, s) => (s.weight ?? 0) > (best.weight ?? 0) ? s : best, ex.sets[0]);
              const summary = bestSet?.weight ? `${bestSet.weight}kg×${bestSet.reps}` : bestSet ? `${bestSet.reps}r` : "";
              return (
                <span key={i}>
                  {i > 0 && <span style={{ opacity: opacity.muted }}> · </span>}
                  <span style={{ fontWeight: weight.medium }}>{ex.name}</span>
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
        style={{ marginTop: sp[6], width: "100%", justifyContent: "center" }}
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
