import { createRoot } from "react-dom/client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

const GOALS = ["hypertrophy", "strength", "endurance", "weight_loss", "health", "mobility"];
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const EMPTY_INJURY = /^(nada|ninguna|ninguno|none|no|n\/a|-|—)$/i;

const iconStyle: React.CSSProperties = { filter: "grayscale(100%)", opacity: 0.7 };

const EXP_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// ── Auto-save hook ──

function useAutoSave() {
  const { callTool } = useCallTool();
  const [savingField, setSavingField] = useState<string | null>(null);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const save = useCallback(async (field: string, value: any) => {
    setSavingField(field);
    setErrorField(null);
    const data: Record<string, any> = {};
    data[field] = value;
    const result = await callTool("manage_profile", { action: "update", data });
    setSavingField(null);
    if (result) {
      setSavedField(field);
      setTimeout(() => setSavedField(prev => prev === field ? null : prev), 800);
    } else {
      setErrorField(field);
      setTimeout(() => setErrorField(prev => prev === field ? null : prev), 2000);
    }
  }, [callTool]);

  return { save, savingField, savedField, errorField };
}

// ── Invisible text input ──

function InvisibleInput({ value, onChange, onBlur, placeholder, fontSize = 18, fontWeight = 600, style }: {
  value: string; onChange: (v: string) => void; onBlur: () => void;
  placeholder: string; fontSize?: number; fontWeight?: number; style?: React.CSSProperties;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      style={{
        fontSize,
        fontWeight,
        fontFamily: "var(--font)",
        border: "none",
        background: "transparent",
        color: "var(--text)",
        outline: "none",
        padding: 0,
        width: "100%",
        borderBottom: "1.5px solid transparent",
        transition: "border-color 0.15s",
        ...style,
      }}
      onFocus={e => { (e.target as HTMLInputElement).style.borderBottomColor = "var(--primary)"; }}
      onBlurCapture={e => { (e.target as HTMLInputElement).style.borderBottomColor = "transparent"; }}
    />
  );
}

// ── Inline metric block ──

function EditableMetric({ value, label, unit, onSave, placeholder, min, max, step, saving, saved, error: hasError }: {
  value: string; label: string; unit?: string;
  onSave: (v: string) => void; placeholder: string;
  min?: number; max?: number; step?: number;
  saving?: boolean; saved?: boolean; error?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = !localValue;

  // Sync from parent when not editing
  useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  const handleBlur = () => {
    setEditing(false);
    if (localValue !== value) {
      onSave(localValue);
    }
  };

  const handleClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        textAlign: "center",
        flex: 1,
        minWidth: 60,
        cursor: "pointer",
        opacity: saving ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={placeholder}
          min={min} max={max} step={step}
          style={{
            width: "100%",
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "var(--font)",
            border: "none",
            borderBottom: "1.5px solid var(--primary)",
            background: "transparent",
            color: "var(--text)",
            outline: "none",
            padding: 0,
            MozAppearance: "textfield",
          }}
        />
      ) : (
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.2,
          color: isEmpty ? "var(--text-secondary)" : "var(--text)",
          borderBottom: isEmpty ? "1.5px dashed var(--border)" : "1.5px solid transparent",
          display: "inline-block",
          minWidth: 30,
        }}>
          {isEmpty ? "—" : localValue}
          {saved && <span style={{ fontSize: 12, marginLeft: 2, color: "var(--success)" }}>✓</span>}
          {hasError && <span style={{ fontSize: 12, marginLeft: 2, color: "var(--danger)" }}>!</span>}
        </div>
      )}
      <div style={{
        fontSize: 11,
        color: "var(--text-secondary)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginTop: 2,
      }}>
        {unit ? `${label} (${unit})` : label}
      </div>
    </div>
  );
}

// ── Weekday toggles ──

function WeekdayToggles({ selected, onToggle }: { selected: string[]; onToggle: (day: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {WEEKDAY_LABELS.map((label, i) => {
        const dayName = DAYS_OF_WEEK[i];
        const active = selected.includes(dayName);
        return (
          <div
            key={i}
            onClick={() => onToggle(dayName)}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              background: active ? "light-dark(#dbeafe, #172554)" : "transparent",
              color: active ? "light-dark(#1e40af, #60a5fa)" : "var(--text-secondary)",
              border: active ? "1.5px solid light-dark(#93c5fd, #1e3a5f)" : "1.5px solid var(--border)",
              cursor: "pointer",
              transition: "all 0.15s",
              opacity: active ? 1 : 0.4,
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

// ── Chip list with add ──

function EditableChips({ items, onAdd, onRemove, addLabel, variant = "primary" }: {
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  addLabel: string;
  variant?: "primary" | "success" | "warning";
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (trimmed && !items.includes(trimmed.toLowerCase())) {
      onAdd(trimmed.toLowerCase());
    }
    setNewValue("");
    setAdding(false);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {items.map((item, i) => (
        <span
          key={i}
          className={`badge badge-${variant}`}
          style={{ textTransform: "capitalize", cursor: "pointer", position: "relative", paddingRight: 20 }}
          onClick={() => onRemove(item)}
        >
          {item.replace("_", " ")}
          <span style={{
            position: "absolute",
            right: 5,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10,
            opacity: 0.6,
          }}>×</span>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          autoFocus
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setNewValue(""); setAdding(false); } }}
          placeholder="type..."
          style={{
            fontSize: 12,
            fontFamily: "var(--font)",
            border: "1px solid var(--primary)",
            borderRadius: 12,
            padding: "2px 10px",
            background: "transparent",
            color: "var(--text)",
            outline: "none",
            width: 80,
          }}
        />
      ) : (
        <span
          onClick={() => setAdding(true)}
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 500,
            border: "1.5px dashed var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--primary)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          + {addLabel}
        </span>
      )}
    </div>
  );
}

// ── Toggleable goal chips ──

function GoalChips({ goals, onToggle, onAdd }: {
  goals: string[];
  onToggle: (g: string) => void;
  onAdd: (g: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (trimmed && !GOALS.includes(trimmed.toLowerCase()) && !goals.includes(trimmed.toLowerCase())) {
      onAdd(trimmed.toLowerCase());
    }
    setNewValue("");
    setAdding(false);
  };

  return (
    <div className="chip-group">
      {GOALS.map(g => (
        <button
          key={g}
          className={`chip${goals.includes(g) ? " chip-active" : ""}`}
          onClick={() => onToggle(g)}
        >
          {g.replace("_", " ")}
        </button>
      ))}
      {/* Custom goals not in the predefined list */}
      {goals.filter(g => !GOALS.includes(g)).map(g => (
        <button key={g} className="chip chip-active" onClick={() => onToggle(g)}>
          {g.replace("_", " ")}
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setNewValue(""); setAdding(false); } }}
          placeholder="custom goal..."
          className="chip"
          style={{ width: 100, outline: "none", borderColor: "var(--primary)" }}
        />
      ) : (
        <button
          className="chip"
          onClick={() => setAdding(true)}
          style={{ borderStyle: "dashed" }}
        >
          + Add
        </button>
      )}
    </div>
  );
}

// ── Section wrapper ──

function Section({ icon, label, children }: { icon: string; label?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            letterSpacing: "0.5px",
          }}>
            {label}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Main widget ──

function ProfileWidget() {
  const data = useToolOutput<{ profile: Record<string, any> }>();
  const { save, savingField, savedField, errorField } = useAutoSave();

  const [name, setName] = useState("");
  const [gym, setGym] = useState("");
  const [age, setAge] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [sex, setSex] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [supplements, setSupplements] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [editingExp, setEditingExp] = useState(false);
  const [editingGym, setEditingGym] = useState(false);
  const gymInputRef = useRef<HTMLInputElement>(null);

  // Initialize from tool output once
  useEffect(() => {
    if (data && !initialized) {
      const p = data.profile || {};
      setName(p.name || "");
      setGym(p.gym || "");
      setAge(p.age?.toString() || "");
      setWeightKg(p.weight_kg?.toString() || "");
      setHeightCm(p.height_cm?.toString() || "");
      setSex(p.sex || "");
      setExperienceLevel(p.experience_level || "");
      setGoals(p.goals || []);
      setAvailableDays(p.available_days || []);
      // Parse supplements
      if (p.supplements) {
        if (typeof p.supplements === "string") {
          setSupplements(p.supplements.split(",").map((s: string) => s.trim()).filter(Boolean));
        } else if (Array.isArray(p.supplements)) {
          setSupplements(p.supplements);
        }
      }
      // Parse injuries
      const rawInjuries = (p.injuries || []).filter((inj: string) => !EMPTY_INJURY.test(inj.trim()));
      setInjuries(rawInjuries);
      setInitialized(true);
    }
  }, [data, initialized]);

  if (!data) return <div className="loading">Loading...</div>;

  // ── Save handlers ──

  const handleNameBlur = () => {
    if (name.trim() && name !== (data.profile?.name || "")) {
      save("name", name.trim());
    }
  };

  const handleGymBlur = () => {
    if (gym !== (data.profile?.gym || "")) {
      save("gym", gym.trim());
    }
  };

  const handleMetricSave = (field: string, rawValue: string) => {
    const num = parseFloat(rawValue);
    if (!isNaN(num) && num > 0) {
      save(field, num);
    }
  };

  const handleSexChange = (v: string) => {
    setSex(v);
    save("sex", v);
  };

  const handleExperienceChange = (v: string) => {
    setExperienceLevel(v);
    save("experience_level", v);
  };

  const handleDayToggle = (day: string) => {
    const next = availableDays.includes(day)
      ? availableDays.filter(d => d !== day)
      : [...availableDays, day];
    setAvailableDays(next);
    save("available_days", next);
  };

  const handleGoalToggle = (g: string) => {
    const next = goals.includes(g) ? goals.filter(x => x !== g) : [...goals, g];
    setGoals(next);
    save("goals", next);
  };

  const handleGoalAdd = (g: string) => {
    const next = [...goals, g];
    setGoals(next);
    save("goals", next);
  };

  const handleSupplementAdd = (s: string) => {
    const next = [...supplements, s];
    setSupplements(next);
    save("supplements", next.join(", "));
  };

  const handleSupplementRemove = (s: string) => {
    const next = supplements.filter(x => x !== s);
    setSupplements(next);
    save("supplements", next.length ? next.join(", ") : "");
  };

  const handleInjuryAdd = (inj: string) => {
    const next = [...injuries, inj];
    setInjuries(next);
    save("injuries", next);
  };

  const handleInjuryRemove = (inj: string) => {
    const next = injuries.filter(x => x !== inj);
    setInjuries(next);
    save("injuries", next.length ? next : []);
  };

  const handleExpClick = () => setEditingExp(true);
  const handleExpSelect = (v: string) => {
    handleExperienceChange(v);
    setEditingExp(false);
  };
  const handleGymClick = () => {
    setEditingGym(true);
    setTimeout(() => gymInputRef.current?.focus(), 0);
  };
  const handleGymInlineBlur = () => {
    setEditingGym(false);
    handleGymBlur();
  };

  // Build subtitle segments
  const hasAnySubtitle = experienceLevel || availableDays.length || gym;

  const subtitleSep = <span style={{ opacity: 0.4, margin: "0 1px" }}> · </span>;

  return (
    <div style={{ maxWidth: 600 }}>
      {/* ── Header: avatar + name + interactive subtitle ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingBottom: 12,
        marginBottom: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "var(--primary)", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700, flexShrink: 0,
        }}>
          {(name || "?")[0]?.toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <InvisibleInput
            value={name}
            onChange={setName}
            onBlur={handleNameBlur}
            placeholder="Your name"
            fontSize={18}
            fontWeight={600}
          />
          <div style={{ fontSize: 13, color: "light-dark(#4b6fa8, #7ba3d4)", marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0 }}>
            {/* Experience — clickable, opens inline selector */}
            {editingExp ? (
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                {EXP_OPTIONS.map(o => (
                  <span
                    key={o.value}
                    onClick={() => handleExpSelect(o.value)}
                    style={{
                      cursor: "pointer",
                      padding: "1px 6px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      background: experienceLevel === o.value ? "light-dark(#dbeafe, #172554)" : "transparent",
                      color: experienceLevel === o.value ? "light-dark(#1e40af, #60a5fa)" : "var(--text-secondary)",
                      border: experienceLevel === o.value ? "1px solid light-dark(#93c5fd, #1e3a5f)" : "1px solid var(--border)",
                    }}
                  >
                    {o.label}
                  </span>
                ))}
              </span>
            ) : (
              <span onClick={handleExpClick} style={{ cursor: "pointer" }}>
                <span style={iconStyle}>📈</span> {experienceLevel ? experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1) : "Level"}
              </span>
            )}

            {subtitleSep}

            {/* Days count — read-only info */}
            <span style={{ color: "var(--text-secondary)" }}><span style={iconStyle}>🗓️</span> {availableDays.length || 0}x/week</span>

            {subtitleSep}

            {/* Gym — clickable, opens inline input */}
            {editingGym ? (
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <span style={iconStyle}>📍</span>{" "}
                <input
                  ref={gymInputRef}
                  value={gym}
                  onChange={e => setGym(e.target.value)}
                  onBlur={handleGymInlineBlur}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  placeholder="Gym name"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "var(--font)",
                    border: "none",
                    borderBottom: "1.5px solid var(--primary)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                    padding: 0,
                    width: 80,
                    textTransform: "uppercase",
                  }}
                />
              </span>
            ) : (
              <span onClick={handleGymClick} style={{ cursor: "pointer" }}>
                <span style={iconStyle}>📍</span> {gym ? gym.trim().toUpperCase() : "Gym"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 8,
        marginBottom: 20,
        padding: "8px 0",
      }}>
        <EditableMetric
          value={age} label="age" placeholder="25" min={10} max={100}
          onSave={v => handleMetricSave("age", v)}
          saving={savingField === "age"} saved={savedField === "age"} error={errorField === "age"}
        />
        <EditableMetric
          value={weightKg} label="weight" unit="kg" placeholder="75" min={20} max={300} step={0.1}
          onSave={v => handleMetricSave("weight_kg", v)}
          saving={savingField === "weight_kg"} saved={savedField === "weight_kg"} error={errorField === "weight_kg"}
        />
        <EditableMetric
          value={heightCm} label="height" unit="cm" placeholder="175" min={100} max={250}
          onSave={v => handleMetricSave("height_cm", v)}
          saving={savingField === "height_cm"} saved={savedField === "height_cm"} error={errorField === "height_cm"}
        />
        <div
          onClick={() => handleSexChange(sex === "male" ? "female" : "male")}
          style={{ textAlign: "center", flex: 1, minWidth: 60, cursor: "pointer" }}
        >
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.2,
            color: sex ? "var(--text)" : "var(--text-secondary)",
            borderBottom: sex ? "1.5px solid transparent" : "1.5px dashed var(--border)",
            display: "inline-block",
            minWidth: 30,
          }}>
            {sex === "male" ? "♂" : sex === "female" ? "♀" : "—"}
          </div>
          <div style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginTop: 2,
          }}>
            sex
          </div>
        </div>
      </div>

      {/* ── Available days ── */}
      <Section icon="📅" label="Training days">
        <WeekdayToggles selected={availableDays} onToggle={handleDayToggle} />
      </Section>

      {/* ── Goals ── */}
      <Section icon="🎯" label="Goals">
        <GoalChips goals={goals} onToggle={handleGoalToggle} onAdd={handleGoalAdd} />
      </Section>

      {/* ── Supplements ── */}
      <Section icon="💊" label="Supplements">
        <EditableChips
          items={supplements}
          onAdd={handleSupplementAdd}
          onRemove={handleSupplementRemove}
          addLabel="Add"
          variant="primary"
        />
      </Section>

      {/* ── Injuries (hidden when empty, no ghost add button — less useful to prompt) ── */}
      {injuries.length > 0 && (
        <Section icon="⚠️" label="Injuries">
          <EditableChips
            items={injuries}
            onAdd={handleInjuryAdd}
            onRemove={handleInjuryRemove}
            addLabel="Add"
            variant="warning"
          />
        </Section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
