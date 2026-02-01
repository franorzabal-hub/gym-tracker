import { createRoot } from "react-dom/client";
import { useState } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

interface TemplateExercise {
  name: string;
  sets: number;
  reps: number;
}

interface TemplateDay {
  day_label: string;
  exercises: TemplateExercise[];
}

interface Template {
  id: string;
  name: string;
  description: string;
  days_per_week: number;
  target_experience: string;
  days: TemplateDay[];
}

interface OnboardingData {
  profile: Record<string, any>;
  templates: Template[];
}

const GOALS = ["hypertrophy", "strength", "endurance", "weight_loss", "health", "mobility"];
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

// Left rail padding — matches programs widget
const RAIL_PX = 18;

function StepBar({ current, total }: { current: number; total: number }) {
  const labels = ["Profile", "Program"];
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 20 }}>
      {labels.slice(0, total).map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div key={i} style={{
            flex: 1,
            textAlign: "center",
            paddingBottom: 8,
            borderBottom: `2px solid ${active || done ? "var(--primary)" : "var(--border)"}`,
            transition: "border-color 0.2s",
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: active ? "var(--primary)" : done ? "var(--text)" : "var(--text-secondary)",
              opacity: active || done ? 1 : 0.5,
            }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeekdayPills({ selected, onToggle }: { selected: string[]; onToggle: (day: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {WEEKDAY_LABELS.map((label, i) => {
        const dayName = DAYS_OF_WEEK[i];
        const active = selected.includes(dayName);
        return (
          <div
            key={i}
            onClick={() => onToggle(dayName)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              background: active ? "var(--primary)" : "var(--bg-secondary)",
              color: active ? "white" : "var(--text-secondary)",
              border: active ? "none" : "1px solid var(--border)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

function ProfileStep({ profile, onComplete }: { profile: Record<string, any>; onComplete: (data: Record<string, any>) => void }) {
  const { callTool, loading, error } = useCallTool();

  const [name, setName] = useState(profile.name || "");
  const [age, setAge] = useState(profile.age?.toString() || "");
  const [weightKg, setWeightKg] = useState(profile.weight_kg?.toString() || "");
  const [heightCm, setHeightCm] = useState(profile.height_cm?.toString() || "");
  const [sex, setSex] = useState(profile.sex || "");
  const [goals, setGoals] = useState<string[]>(profile.goals || []);
  const [experienceLevel, setExperienceLevel] = useState(profile.experience_level || "");
  const [trainingDays, setTrainingDays] = useState(profile.training_days_per_week?.toString() || "");
  const [availableDays, setAvailableDays] = useState<string[]>(profile.available_days || []);
  const [injuries, setInjuries] = useState(profile.injuries?.join(", ") || "");
  const [preferredUnits, setPreferredUnits] = useState(profile.preferred_units || "kg");
  const [gym, setGym] = useState(profile.gym || "");
  const [supplements, setSupplements] = useState(profile.supplements || "");

  const isValid = name.trim() && age && weightKg && heightCm;

  const toggleGoal = (g: string) => {
    setGoals(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const toggleDay = (d: string) => {
    setAvailableDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const handleSubmit = async () => {
    const data: Record<string, any> = {
      name: name.trim(),
      age: parseInt(age),
      weight_kg: parseFloat(weightKg),
      height_cm: parseFloat(heightCm),
    };
    if (sex) data.sex = sex;
    if (goals.length) data.goals = goals;
    if (experienceLevel) data.experience_level = experienceLevel;
    if (trainingDays) data.training_days_per_week = parseInt(trainingDays);
    if (availableDays.length) data.available_days = availableDays;
    if (injuries.trim()) data.injuries = injuries.split(",").map(s => s.trim()).filter(Boolean);
    if (preferredUnits) data.preferred_units = preferredUnits;
    if (gym.trim()) data.gym = gym.trim();
    if (supplements.trim()) data.supplements = supplements.trim();

    const result = await callTool("manage_profile", { action: "update", data });
    if (result) onComplete(data);
  };

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Set up your profile</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
        Tell us about yourself to get personalized recommendations.
      </div>

      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="form-group">
          <label className="form-label">Age *</label>
          <input className="form-input" type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="25" min="10" max="100" />
        </div>
        <div className="form-group">
          <label className="form-label">Weight (kg) *</label>
          <input className="form-input" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="75" min="20" max="300" step="0.1" />
        </div>
        <div className="form-group">
          <label className="form-label">Height (cm) *</label>
          <input className="form-input" type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="175" min="100" max="250" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Sex</label>
        <select className="form-input" value={sex} onChange={e => setSex(e.target.value)}>
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Goals</label>
        <div className="chip-group">
          {GOALS.map(g => (
            <button key={g} className={`chip${goals.includes(g) ? " chip-active" : ""}`} onClick={() => toggleGoal(g)}>
              {g.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">Experience level</label>
          <select className="form-input" value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}>
            <option value="">—</option>
            {EXPERIENCE_LEVELS.map(l => (
              <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Training days/week</label>
          <input className="form-input" type="number" value={trainingDays} onChange={e => setTrainingDays(e.target.value)} placeholder="4" min="1" max="7" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Available days</label>
        <WeekdayPills selected={availableDays} onToggle={toggleDay} />
      </div>

      <div className="form-group">
        <label className="form-label">Injuries or limitations</label>
        <input className="form-input" value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="e.g. lower back pain, shoulder impingement" />
      </div>

      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">Preferred units</label>
          <select className="form-input" value={preferredUnits} onChange={e => setPreferredUnits(e.target.value)}>
            <option value="kg">Kilograms (kg)</option>
            <option value="lb">Pounds (lb)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Gym</label>
          <input className="form-input" value={gym} onChange={e => setGym(e.target.value)} placeholder="Your gym name" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Supplements</label>
        <input className="form-input" value={supplements} onChange={e => setSupplements(e.target.value)} placeholder="e.g. creatine, protein" />
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={!isValid || loading} onClick={handleSubmit}>
        {loading ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}

function TemplateDayPreview({ day }: { day: TemplateDay }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 4,
        paddingLeft: RAIL_PX + 2,
      }}>
        {day.day_label}
      </div>
      <div style={{
        borderLeft: "2px solid var(--border)",
        borderBottomLeftRadius: 8,
        paddingLeft: RAIL_PX,
      }}>
        {day.exercises.map((e, j) => (
          <div key={j} style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "0 8px",
            marginBottom: j < day.exercises.length - 1 ? 4 : 0,
          }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{e.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{e.sets}</span>
              <span style={{ opacity: 0.4 }}> × </span>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{e.reps}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgramStep({ templates, profileData }: { templates: Template[]; profileData: Record<string, any> }) {
  const { callTool, loading, error } = useCallTool();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "success" | "custom">("select");
  const [programName, setProgramName] = useState("");

  const userDays = profileData.training_days_per_week || 4;
  const userExp = profileData.experience_level || "intermediate";

  const getRecommended = (): string | null => {
    const byDays = templates.filter(t => t.days_per_week <= userDays);
    if (!byDays.length) return templates[0]?.id || null;
    const byExp = byDays.filter(t => t.target_experience === userExp);
    return (byExp.length ? byExp[byExp.length - 1] : byDays[byDays.length - 1])?.id || null;
  };

  const recommendedId = getRecommended();

  const handleSelectTemplate = async (id: string) => {
    setSelectedId(id);
    const result = await callTool("manage_program", { action: "create_from_template", template_id: id });
    if (result) {
      setProgramName(templates.find(t => t.id === id)?.name || "");
      setStep("success");
    }
  };

  if (step === "success") {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--success)", color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 700, marginBottom: 12,
        }}>
          ✓
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>You're all set!</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {programName ? `"${programName}" is ready.` : "Your program is ready."}{" "}
          Start training by telling me what you want to do.
        </div>
      </div>
    );
  }

  if (step === "custom") {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--primary)", color: "white",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, marginBottom: 12,
        }}>
          💬
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Custom program</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Describe your ideal program in the chat and I'll build it for you.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Choose a program</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
        Pick a template to start, or create a custom program.
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {templates.map((t, idx) => {
          const isRecommended = t.id === recommendedId;
          const isExpanded = expandedId === t.id;
          const isLoading = loading && selectedId === t.id;

          return (
            <div key={t.id} style={{
              borderBottom: idx < templates.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none",
              paddingBottom: 12,
              marginBottom: 12,
              opacity: isLoading ? 0.7 : 1,
            }}>
              {/* Template header */}
              <div
                style={{ cursor: loading ? "default" : "pointer" }}
                onClick={() => !loading && handleSelectTemplate(t.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {isRecommended && <span className="badge badge-primary" style={{ fontSize: 10 }}>Recommended</span>}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                    }}>
                      {t.days_per_week}x/week
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {t.description}
                  <span style={{ opacity: 0.4, margin: "0 5px" }}>•</span>
                  <span style={{ textTransform: "capitalize" }}>{t.target_experience}</span>
                </div>
              </div>

              {/* Toggle preview */}
              <button
                onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : t.id); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--primary)",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: "4px 0 0",
                  fontFamily: "var(--font)",
                }}
              >
                {isExpanded ? "Hide exercises ▲" : "Show exercises ▼"}
              </button>

              {/* Exercise preview — matching programs widget rail style */}
              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  {t.days.map((d, i) => (
                    <TemplateDayPreview key={i} day={d} />
                  ))}
                </div>
              )}

              {isLoading && (
                <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 4 }}>Creating program...</div>
              )}
            </div>
          );
        })}

        {/* Custom option */}
        <div
          style={{
            cursor: loading ? "default" : "pointer",
            textAlign: "center",
            padding: "12px 0",
            borderTop: "1px dashed var(--border)",
          }}
          onClick={() => !loading && setStep("custom")}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>Custom program</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 2 }}>
            Build your own with AI assistance
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingWidget() {
  const data = useToolOutput<OnboardingData>();
  const [step, setStep] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, any>>({});

  if (!data) return <div className="loading">Loading...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <StepBar current={step} total={2} />
      {step === 0 && (
        <ProfileStep
          profile={data.profile}
          onComplete={(saved) => { setProfileData(saved); setStep(1); }}
        />
      )}
      {step === 1 && (
        <ProgramStep templates={data.templates} profileData={profileData} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><OnboardingWidget /></AppProvider>
);
