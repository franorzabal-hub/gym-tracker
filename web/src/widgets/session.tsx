import { createRoot } from "react-dom/client";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

function SessionWidget() {
  const data = useToolOutput();
  const { callTool, loading } = useCallTool();

  if (!data) return <div className="loading">Loading...</div>;

  // Active session view
  if (data.active !== undefined) {
    if (!data.active) return <div className="empty">No active session</div>;
    return (
      <div>
        <div className="title">Active Session</div>
        <div className="grid grid-2">
          <div className="card"><div className="stat-value">{data.duration_minutes ?? 0}m</div><div className="stat-label">Duration</div></div>
          <div className="card"><div className="stat-value">{data.exercises?.length ?? 0}</div><div className="stat-label">Exercises</div></div>
        </div>
        {data.exercises?.map((ex: any, i: number) => (
          <div key={i} className="card">
            <strong>{ex.name}</strong>
            {ex.sets?.length > 0 && <span className="subtitle"> — {ex.sets.length} sets</span>}
          </div>
        ))}
      </div>
    );
  }

  // Session started/ended view
  return (
    <div>
      <div className="title">{data.session_ended !== undefined ? "Session Summary" : "Session Started"}</div>
      {data.duration_minutes && <div className="card"><div className="stat-value">{Math.round(data.duration_minutes)}m</div><div className="stat-label">Duration</div></div>}
      {data.total_volume_kg && <div className="card"><div className="stat-value">{data.total_volume_kg}kg</div><div className="stat-label">Volume</div></div>}
      {data.exercises_logged && (
        Array.isArray(data.exercises_logged)
          ? data.exercises_logged.map((ex: any, i: number) => (
              <div key={i} className="card">
                <strong>{ex.exercise || ex.name || ex.exercise_name}</strong>
                {ex.sets && <span> — {typeof ex.sets === "number" ? ex.sets : ex.sets.length} sets</span>}
              </div>
            ))
          : <div className="card">Exercises logged: {data.exercises_logged}</div>
      )}
      {data.new_prs?.length > 0 && (
        <div className="card">
          <div className="subtitle">New PRs!</div>
          {data.new_prs.map((pr: any, i: number) => (
            <div key={i} className="pr-badge">{pr.exercise}: {pr.record_type} = {pr.value}</div>
          ))}
        </div>
      )}
      {data.comparison && (
        <div className="card">
          <div className="subtitle">vs Last Session</div>
          {data.comparison.volume_change && <div>Volume: {data.comparison.volume_change}</div>}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><SessionWidget /></AppProvider>
);
