import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

function ProfileWidget() {
  const data = useToolOutput<{ profile: Record<string, any> }>();

  if (!data) return <div className="loading">Loading...</div>;

  const p = data.profile || {};

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--primary)", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700,
        }}>
          {(p.name || "?")[0]?.toUpperCase()}
        </div>
        <div>
          <div className="title" style={{ marginBottom: 0 }}>{p.name || "No name"}</div>
          {p.gym && <div className="subtitle" style={{ marginBottom: 0 }}>{p.gym}</div>}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 8 }}>
        {p.sex && (
          <div className="card">
            <div className="stat-value" style={{ textTransform: "capitalize" }}>{p.sex === "male" ? "♂ Male" : p.sex === "female" ? "♀ Female" : p.sex}</div>
            <div className="stat-label">Sex</div>
          </div>
        )}
        {p.age && (
          <div className="card">
            <div className="stat-value">{p.age}</div>
            <div className="stat-label">Age</div>
          </div>
        )}
        {p.weight_kg && (
          <div className="card">
            <div className="stat-value">{p.weight_kg}<span style={{ fontSize: 14 }}>kg</span></div>
            <div className="stat-label">Weight</div>
          </div>
        )}
        {p.height_cm && (
          <div className="card">
            <div className="stat-value">{p.height_cm}<span style={{ fontSize: 14 }}>cm</span></div>
            <div className="stat-label">Height</div>
          </div>
        )}
        {p.training_days_per_week && (
          <div className="card">
            <div className="stat-value">{p.training_days_per_week}<span style={{ fontSize: 14 }}>x</span></div>
            <div className="stat-label">Days / Week</div>
          </div>
        )}
      </div>

      {p.available_days?.length > 0 && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Training Days</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {p.available_days.map((d: string, i: number) => (
              <span key={i} className="badge badge-primary" style={{ textTransform: "capitalize" }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {p.experience_level && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Experience</div>
          <span className="badge badge-primary" style={{ textTransform: "capitalize" }}>{p.experience_level}</span>
        </div>
      )}

      {p.goals?.length > 0 && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Goals</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {p.goals.map((g: string, i: number) => (
              <span key={i} className="badge badge-success" style={{ textTransform: "capitalize" }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {p.injuries?.length > 0 && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Injuries / Notes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {p.injuries.map((inj: string, i: number) => (
              <span key={i} className="badge badge-warning">{inj}</span>
            ))}
          </div>
        </div>
      )}

      {p.preferred_units && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Preferred Units</div>
          <span className="badge badge-primary">{p.preferred_units}</span>
        </div>
      )}

      {p.supplements && (
        <div className="card">
          <div className="subtitle" style={{ marginBottom: 4 }}>Supplements</div>
          <div>{typeof p.supplements === "string" ? p.supplements : JSON.stringify(p.supplements)}</div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
