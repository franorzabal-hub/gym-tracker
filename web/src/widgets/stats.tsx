import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

function StatsWidget() {
  const data = useToolOutput();

  if (!data) return <div className="loading">Loading...</div>;

  // Multi-exercise stats
  if (data.stats) {
    return (
      <div>
        <div className="title">Exercise Stats</div>
        {data.stats.map((s: any, i: number) => (
          <div key={i} className="card">
            <strong>{s.exercise}</strong>
            {s.personal_records && Object.entries(s.personal_records).map(([type, pr]: [string, any]) => (
              <div key={type}>{type}: {pr.value}</div>
            ))}
            {s.frequency && <div className="subtitle">{s.frequency.sessions_per_week}x/week</div>}
          </div>
        ))}
      </div>
    );
  }

  // Single exercise or history
  const sessions = data.sessions;
  if (sessions) {
    return (
      <div>
        <div className="title">Workout History</div>
        {data.summary && (
          <div className="grid grid-2">
            <div className="card"><div className="stat-value">{data.summary.total_sessions}</div><div className="stat-label">Sessions</div></div>
            <div className="card"><div className="stat-value">{data.summary.total_volume_kg}kg</div><div className="stat-label">Volume</div></div>
          </div>
        )}
        {sessions.map((s: any, i: number) => (
          <div key={i} className="card">
            <strong>{new Date(s.started_at).toLocaleDateString()}</strong>
            {s.program_day && <span className="badge badge-primary">{s.program_day}</span>}
            {s.exercises?.map((ex: any, j: number) => (
              <div key={j} className="subtitle">{ex.exercise} — {ex.sets?.length ?? ex.total_sets ?? 0} sets</div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Single exercise stats
  return (
    <div>
      <div className="title">{data.exercise ?? "Stats"}</div>
      {data.personal_records && (
        <div className="card">
          <div className="subtitle">Personal Records</div>
          {Object.entries(data.personal_records).map(([type, pr]: [string, any]) => (
            <div key={type}><strong>{type}:</strong> {pr.value}</div>
          ))}
        </div>
      )}
      {data.frequency && (
        <div className="card">
          <div className="stat-value">{data.frequency.sessions_per_week}x</div>
          <div className="stat-label">per week ({data.frequency.total_sessions} total)</div>
        </div>
      )}
      {data.progression?.length > 0 && (
        <div className="card">
          <div className="subtitle">Recent Progression</div>
          <table className="table">
            <thead><tr><th>Date</th><th>Weight</th><th>Reps</th><th>E1RM</th></tr></thead>
            <tbody>
              {data.progression.slice(-10).map((p: any, i: number) => (
                <tr key={i}>
                  <td>{new Date(p.date).toLocaleDateString()}</td>
                  <td>{p.weight}kg</td>
                  <td>{p.reps}</td>
                  <td>{p.estimated_1rm ? `${p.estimated_1rm}kg` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><StatsWidget /></AppProvider>
);
