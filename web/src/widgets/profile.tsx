import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

const SEX_SYMBOL: Record<string, string> = {
  male: "♂",
  female: "♀",
};

function MetricBlock({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 60 }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const EMPTY_INJURY = /^(nada|ninguna|ninguno|none|no|n\/a|-|—)$/i;

function Section({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 26 }}>
      <span style={{ width: 32, fontSize: 14, lineHeight: "22px", flexShrink: 0, textAlign: "center" }}>{icon}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "success" | "warning" }) {
  return (
    <span className={`badge badge-${variant}`} style={{ textTransform: "capitalize" }}>
      {children}
    </span>
  );
}

function ProfileWidget() {
  const data = useToolOutput<{ profile: Record<string, any> }>();

  if (!data) return <div className="loading">Loading...</div>;

  const p = data.profile || {};

  // Header subtitle parts
  const subtitleParts: string[] = [];
  if (p.experience_level) subtitleParts.push(`📈 ${p.experience_level.charAt(0).toUpperCase() + p.experience_level.slice(1)}`);
  if (p.training_days_per_week) subtitleParts.push(`🗓️ ${p.training_days_per_week}x/week`);
  if (p.gym) subtitleParts.push(`📍 ${p.gym.toUpperCase()}`);

  // Metric blocks
  const metrics: { value: string | number; label: string }[] = [];
  if (p.age) metrics.push({ value: p.age, label: "yr" });
  if (p.weight_kg) metrics.push({ value: p.weight_kg, label: "kg" });
  if (p.height_cm) metrics.push({ value: p.height_cm, label: "cm" });
  if (p.sex && SEX_SYMBOL[p.sex]) metrics.push({ value: SEX_SYMBOL[p.sex], label: "sex" });

  const hasAvailableDays = p.available_days?.length > 0;
  const hasGoals = p.goals?.length > 0;
  const injuries = (p.injuries || []).filter((inj: string) => !EMPTY_INJURY.test(inj.trim()));
  const hasInjuries = injuries.length > 0;

  // Supplements
  const supplements: string[] = [];
  if (p.supplements) {
    if (typeof p.supplements === "string") {
      supplements.push(...p.supplements.split(",").map((s: string) => s.trim()).filter(Boolean));
    } else if (Array.isArray(p.supplements)) {
      supplements.push(...p.supplements);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header: avatar + name + subtitle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingBottom: 16,
        marginBottom: 18,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--primary)", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {(p.name || "?")[0]?.toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{p.name || "No name"}</div>
          {subtitleParts.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", filter: "grayscale(100%)" }}>
              {subtitleParts.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Metric blocks */}
      {metrics.length > 0 && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginBottom: 18,
        }}>
          {metrics.map((m, i) => (
            <MetricBlock key={i} value={m.value} label={m.label} />
          ))}
        </div>
      )}

      {/* Icon rows — no dividers, whitespace separates */}
      {hasAvailableDays && (
        <Section icon="📅">
          {p.available_days.map((d: string, i: number) => (
            <span key={i} style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "2px 10px",
              borderRadius: 12,
              background: "var(--primary)",
              color: "white",
              textTransform: "capitalize",
            }}>
              {d.substring(0, 3)}
            </span>
          ))}
        </Section>
      )}

      {hasGoals && (
        <Section icon="🎯">
          {p.goals.map((g: string, i: number) => <Pill key={i} variant="success">{g}</Pill>)}
        </Section>
      )}

      {supplements.length > 0 && (
        <Section icon="💊">
          {supplements.map((s: string, i: number) => <Pill key={i}>{s}</Pill>)}
        </Section>
      )}

      {hasInjuries && (
        <Section icon="⚠️">
          {injuries.map((inj: string, i: number) => <Pill key={i} variant="warning">{inj}</Pill>)}
        </Section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
