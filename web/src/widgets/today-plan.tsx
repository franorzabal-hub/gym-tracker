import { createRoot } from "react-dom/client";
import { useToolOutput, useTheme, useCallTool } from "../hooks.js";
import "../styles.css";

function TodayPlanWidget() {
  const data = useToolOutput();
  const theme = useTheme();
  const { callTool, loading } = useCallTool();

  if (!data) return <div className="loading">Loading...</div>;

  if (data.rest_day) {
    return (
      <div className={theme === "dark" ? "dark" : ""}>
        <div className="title">Rest Day</div>
        <div className="empty">{data.message || "No workout scheduled for today"}</div>
      </div>
    );
  }

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="title">{data.day} — {data.program}</div>
      {data.exercises?.map((ex: any, i: number) => (
        <div key={i} className="card">
          <strong>{ex.name}</strong>
          <div className="subtitle">
            {ex.target_sets}x{ex.target_reps}
            {ex.target_weight ? ` @ ${ex.target_weight}kg` : ""}
            {ex.target_rpe ? ` RPE ${ex.target_rpe}` : ""}
          </div>
          {ex.notes && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ex.notes}</div>}
        </div>
      ))}
      {data.last_workout && (
        <div style={{ marginTop: 16 }}>
          <div className="subtitle">Last Workout — {new Date(data.last_workout.date).toLocaleDateString()}</div>
          {data.last_workout.exercises?.map((ex: any, i: number) => (
            <div key={i} className="card">
              <strong>{ex.name}</strong>
              {ex.sets?.map((s: any, j: number) => (
                <span key={j} className="badge" style={{ marginLeft: 4 }}>
                  {s.reps}x{s.weight ? `${s.weight}kg` : "BW"}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}
        onClick={() => callTool("start_session")}
        disabled={loading}>
        {loading ? "Starting..." : "Start Session"}
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<TodayPlanWidget />);
