import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import { Sparkline } from "./shared/charts.js";
import "../styles.css";

const PR_LABELS: Record<string, string> = {
  max_weight: "Max Weight",
  max_reps_at_weight: "Max Reps",
  estimated_1rm: "Est. 1RM",
};

function formatPRLabel(type: string): string {
  return PR_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function StatsWidget() {
  const data = useToolOutput<any>();

  if (!data) return <div className="loading">Loading...</div>;

  // Multi-exercise stats
  if (data.stats) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="title">Exercise Stats</div>
        {data.stats.map((s: any, i: number) => {
          const muscleColor = s.muscle_group ? MUSCLE_COLOR[s.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
          return (
            <div key={i} className="card" style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <ExerciseIcon name={s.exercise} color={muscleColor} size={18} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{s.exercise}</span>
                {s.frequency && (
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {s.frequency.sessions_per_week}×/week
                  </span>
                )}
              </div>
              {s.personal_records && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {Object.entries(s.personal_records).map(([type, pr]: [string, any]) => (
                    <div key={type} style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{pr.value}</div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                        {formatPRLabel(type)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // History view
  const sessions = data.sessions;
  if (sessions) {
    return (
      <div style={{ maxWidth: 600 }}>
        <div className="title">Workout History</div>
        {data.summary && (
          <div className="grid grid-2" style={{ marginBottom: 8 }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value">{data.summary.total_sessions}</div>
              <div className="stat-label">Sessions</div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value">{data.summary.total_volume_kg}kg</div>
              <div className="stat-label">Volume</div>
            </div>
          </div>
        )}
        {sessions.map((s: any, i: number) => (
          <div key={i} className="card" style={{ padding: "8px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              {s.program_day && <span className="badge badge-primary" style={{ fontSize: 9 }}>{s.program_day}</span>}
            </div>
            {s.exercises?.map((ex: any, j: number) => (
              <div key={j} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {ex.exercise} — {ex.sets?.length ?? ex.total_sets ?? 0} sets
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Single exercise stats
  const muscleColor = data.muscle_group ? MUSCLE_COLOR[data.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <ExerciseIcon name={data.exercise || "exercise"} color={muscleColor} size={20} />
        <span style={{ fontWeight: 600, fontSize: 16 }}>{data.exercise ?? "Stats"}</span>
      </div>

      {/* PRs */}
      {data.personal_records && (
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>
            Personal Records
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(data.personal_records).map(([type, pr]: [string, any]) => (
              <div key={type}>
                <div style={{ fontWeight: 700, fontSize: 20, color: "var(--warning)" }}>{pr.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  {formatPRLabel(type)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequency */}
      {data.frequency && (
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="stat-value">{data.frequency.sessions_per_week}×</span>
            <span className="stat-label">per week ({data.frequency.total_sessions} total)</span>
          </div>
        </div>
      )}

      {/* Progression */}
      {data.progression?.length > 0 && (
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 8 }}>
            Progression
          </div>

          {/* Sparkline */}
          {data.progression.length >= 3 && (
            <div style={{ marginBottom: 8 }}>
              <Sparkline
                data={data.progression.map((p: any) => p.estimated_1rm ?? p.weight ?? 0)}
                width={280}
                height={45}
                color="var(--primary)"
              />
            </div>
          )}

          {/* Recent entries as compact cards */}
          {data.progression.slice(-8).map((p: any, i: number) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "4px 0",
              borderBottom: i < Math.min(data.progression.length, 8) - 1 ? "1px solid var(--border)" : "none",
              fontSize: 12,
            }}>
              <span style={{ color: "var(--text-secondary)" }}>
                {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span style={{ fontWeight: 600 }}>
                {p.weight}kg × {p.reps}
              </span>
              {p.estimated_1rm && (
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  e1RM {p.estimated_1rm}kg
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><StatsWidget /></AppProvider>
);
