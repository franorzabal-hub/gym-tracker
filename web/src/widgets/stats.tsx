import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import { Sparkline } from "./shared/charts.js";
import { sp, font, weight, maxWidth, opacity } from "../tokens.js";
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
      <div style={{ maxWidth: maxWidth.widget }}>
        <div className="title">Exercise Stats</div>
        {data.stats.map((s: any, i: number) => {
          const muscleColor = s.muscle_group ? MUSCLE_COLOR[s.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
          return (
            <div key={i} className="card" style={{ padding: `${sp[5]}px ${sp[6]}px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[3] }}>
                <ExerciseIcon name={s.exercise} color={muscleColor} size={18} />
                <span style={{ fontWeight: weight.semibold, fontSize: font.base, flex: 1 }}>{s.exercise}</span>
                {s.frequency && (
                  <span style={{ fontSize: font.xs, color: "var(--text-secondary)" }}>
                    {s.frequency.sessions_per_week}×/week
                  </span>
                )}
              </div>
              {s.personal_records && (
                <div style={{ display: "flex", gap: sp[6], flexWrap: "wrap" }}>
                  {Object.entries(s.personal_records).map(([type, pr]: [string, any]) => (
                    <div key={type} style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: weight.bold, fontSize: font.xl }}>{pr.value}</div>
                      <div style={{ fontSize: font["2xs"], color: "var(--text-secondary)", textTransform: "uppercase" }}>
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
      <div style={{ maxWidth: maxWidth.widget }}>
        <div className="title">Workout History</div>
        {data.summary && (
          <div className="grid grid-2" style={{ marginBottom: sp[4] }}>
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
          <div key={i} className="card" style={{ padding: `${sp[4]}px ${sp[6]}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: weight.semibold, fontSize: font.base }}>
                {new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              {s.program_day && <span className="badge badge-primary" style={{ fontSize: font["2xs"] }}>{s.program_day}</span>}
            </div>
            {s.exercises?.map((ex: any, j: number) => (
              <div key={j} style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[1] }}>
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
    <div style={{ maxWidth: maxWidth.widget }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[6] }}>
        <ExerciseIcon name={data.exercise || "exercise"} color={muscleColor} size={20} />
        <span style={{ fontWeight: weight.semibold, fontSize: font.xl }}>{data.exercise ?? "Stats"}</span>
      </div>

      {/* PRs */}
      {data.personal_records && (
        <div className="card" style={{ padding: `${sp[5]}px ${sp[6]}px` }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: sp[4] }}>
            Personal Records
          </div>
          <div style={{ display: "flex", gap: sp[8], flexWrap: "wrap" }}>
            {Object.entries(data.personal_records).map(([type, pr]: [string, any]) => (
              <div key={type}>
                <div style={{ fontWeight: weight.bold, fontSize: font["2xl"], color: "var(--warning)" }}>{pr.value}</div>
                <div style={{ fontSize: font["2xs"], color: "var(--text-secondary)", textTransform: "uppercase" }}>
                  {formatPRLabel(type)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequency */}
      {data.frequency && (
        <div className="card" style={{ padding: `${sp[5]}px ${sp[6]}px` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: sp[3] }}>
            <span className="stat-value">{data.frequency.sessions_per_week}×</span>
            <span className="stat-label">per week ({data.frequency.total_sessions} total)</span>
          </div>
        </div>
      )}

      {/* Progression */}
      {data.progression?.length > 0 && (
        <div className="card" style={{ padding: `${sp[5]}px ${sp[6]}px` }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: sp[4] }}>
            Progression
          </div>

          {/* Sparkline */}
          {data.progression.length >= 3 && (
            <div style={{ marginBottom: sp[4] }}>
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
              padding: `${sp[2]}px 0`,
              borderBottom: i < Math.min(data.progression.length, 8) - 1 ? "1px solid var(--border)" : "none",
              fontSize: font.sm,
            }}>
              <span style={{ color: "var(--text-secondary)" }}>
                {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span style={{ fontWeight: weight.semibold }}>
                {p.weight}kg × {p.reps}
              </span>
              {p.estimated_1rm && (
                <span style={{ fontSize: font.xs, color: "var(--text-secondary)" }}>
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
