import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import "../styles.css";

const PR_LABELS: Record<string, string> = {
  max_weight: "Max Weight",
  max_reps_at_weight: "Max Reps",
  estimated_1rm: "Est. 1RM",
};

function formatPRLabel(type: string): string {
  return PR_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function SessionWidget() {
  const data = useToolOutput<any>();

  if (!data) return <div className="loading">Loading...</div>;

  // Active session view
  if (data.active !== undefined) {
    if (!data.active) return <div className="empty">No active session</div>;
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="title">Active Session</div>
        <div className="grid grid-2" style={{ marginBottom: 8 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">{data.duration_minutes ?? 0}m</div>
            <div className="stat-label">Duration</div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="stat-value">{data.exercises?.length ?? 0}</div>
            <div className="stat-label">Exercises</div>
          </div>
        </div>
        {data.exercises?.map((ex: any, i: number) => {
          const muscleColor = ex.muscle_group ? MUSCLE_COLOR[ex.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
          return (
            <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
              <ExerciseIcon name={ex.name} color={muscleColor} size={16} />
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{ex.name}</span>
              {ex.sets?.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ex.sets.length} sets</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Session started/ended summary
  const isEnded = data.session_ended !== undefined;

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="title">{isEnded ? "Session Summary" : "Session Started"}</div>

      {/* Stats row */}
      {(data.duration_minutes || data.total_volume_kg) && (
        <div className="grid grid-2" style={{ marginBottom: 8 }}>
          {data.duration_minutes && (
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value">{Math.round(data.duration_minutes)}m</div>
              <div className="stat-label">Duration</div>
            </div>
          )}
          {data.total_volume_kg && (
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value">{data.total_volume_kg}kg</div>
              <div className="stat-label">Volume</div>
            </div>
          )}
        </div>
      )}

      {/* Exercises */}
      {data.exercises_logged && Array.isArray(data.exercises_logged) && (
        data.exercises_logged.map((ex: any, i: number) => {
          const name = ex.exercise || ex.name || ex.exercise_name;
          const muscleColor = ex.muscle_group ? MUSCLE_COLOR[ex.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
          const setCount = typeof ex.sets === "number" ? ex.sets : ex.sets?.length;
          return (
            <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
              <ExerciseIcon name={name} color={muscleColor} size={16} />
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{name}</span>
              {setCount && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{setCount} sets</span>}
            </div>
          );
        })
      )}

      {/* PRs */}
      {data.new_prs?.length > 0 && (
        <div className="card" style={{ padding: "10px 12px", marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
            New PRs
          </div>
          {data.new_prs.map((pr: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{pr.exercise}</span>
              <span style={{ fontSize: 12, color: "var(--warning)", fontWeight: 600 }}>
                {formatPRLabel(pr.record_type)}: {pr.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Comparison */}
      {data.comparison && (
        <div className="card" style={{ padding: "10px 12px", marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
            vs Last Session
          </div>
          {data.comparison.volume_change && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Volume</span>
              <span className={`badge ${String(data.comparison.volume_change).startsWith("+") ? "badge-success" : "badge-danger"}`} style={{ fontSize: 11 }}>
                {data.comparison.volume_change}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><SessionWidget /></AppProvider>
);
