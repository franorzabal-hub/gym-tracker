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
const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`step-dot${i <= current ? " active" : ""}`} />
      ))}
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
      <div className="title">Set up your profile</div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
        Tell us about yourself to get personalized recommendations.
      </p>

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
        <div className="chip-group">
          {DAYS_OF_WEEK.map(d => (
            <button key={d} className={`chip${availableDays.includes(d) ? " chip-active" : ""}`} onClick={() => toggleDay(d)}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
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

function ProgramStep({ templates, profileData }: { templates: Template[]; profileData: Record<string, any> }) {
  const { callTool, loading, error } = useCallTool();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "success" | "custom">("select");
  const [programName, setProgramName] = useState("");

  const userDays = profileData.training_days_per_week || 4;
  const userExp = profileData.experience_level || "intermediate";

  const getRecommended = (): string | null => {
    // Match by days first, then experience
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
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <div className="title">You're all set!</div>
        <p style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
          {programName ? `Program "${programName}" is ready.` : "Your program is ready."}
        </p>
        <p style={{ color: "var(--text-secondary)" }}>
          Start training by telling me what you want to do.
        </p>
      </div>
    );
  }

  if (step === "custom") {
    return (
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
        <div className="title">Custom program</div>
        <p style={{ color: "var(--text-secondary)" }}>
          Describe your ideal program in the chat and I'll build it for you.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="title">Choose a program</div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
        Pick a template to start, or create a custom program.
      </p>

      {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map(t => (
          <div
            key={t.id}
            className={`card template-card${t.id === recommendedId ? " recommended" : ""}`}
            onClick={() => !loading && handleSelectTemplate(t.id)}
            style={{ opacity: loading && selectedId === t.id ? 0.7 : 1 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {t.id === recommendedId && <span className="badge badge-primary">Recommended</span>}
                <span className="badge badge-success">{t.days_per_week}x/week</span>
              </div>
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{t.description}</div>

            <button
              className="btn"
              style={{ marginTop: 8, fontSize: 12, padding: "4px 8px" }}
              onClick={e => { e.stopPropagation(); setExpandedId(expandedId === t.id ? null : t.id); }}
            >
              {expandedId === t.id ? "Hide exercises" : "Show exercises"}
            </button>

            {expandedId === t.id && (
              <div style={{ marginTop: 8 }}>
                {t.days.map((d, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{d.day_label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {d.exercises.map((e, j) => (
                        <div key={j}>{e.name} — {e.sets}×{e.reps}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loading && selectedId === t.id && (
              <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 4 }}>Creating program...</div>
            )}
          </div>
        ))}

        <div
          className="card template-card custom"
          onClick={() => !loading && setStep("custom")}
        >
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontWeight: 600 }}>Custom program</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>
              Build your own with AI assistance
            </div>
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
    <div>
      <StepIndicator current={step} total={2} />
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
