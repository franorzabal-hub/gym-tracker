import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

// ── Types ──

interface SetData {
  set_id: number;
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  set_type: string;
}

interface ExerciseData {
  name: string;
  superset_group: number | null;
  sets: SetData[];
}

interface SessionData {
  session_id: number;
  started_at: string;
  duration_minutes: number;
  program_day: string | null;
  tags: string[];
  exercises: ExerciseData[];
}

interface ExerciseSuggestion {
  name: string;
  muscle_group: string | null;
}

interface ToolData {
  session: SessionData | null;
  exerciseCatalog?: ExerciseSuggestion[];
}

// ── Live timer hook ──

function useLiveTimer(startedAt: string) {
  const [minutes, setMinutes] = useState(() =>
    Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
  );
  useEffect(() => {
    const tick = () => setMinutes(Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [startedAt]);
  return minutes;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Editable number (click-to-edit) ──

function EditableNumber({
  value,
  onChange,
  placeholder,
  min,
  step,
  width = 40,
  fontWeight = 600,
  fontSize = 13,
  color,
  allowNull,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  min?: number;
  step?: number;
  width?: number;
  fontWeight?: number;
  fontSize?: number;
  color?: string;
  allowNull?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(value?.toString() ?? "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const num = parseFloat(local);
    if (!isNaN(num) && num >= (min ?? 0)) {
      onChange(num);
    } else if (allowNull && local === "") {
      onChange(null);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={placeholder}
        min={min}
        step={step}
        style={{
          width,
          textAlign: "center",
          fontSize,
          fontWeight,
          fontFamily: "var(--font)",
          border: "none",
          borderBottom: "1.5px solid var(--primary)",
          background: "transparent",
          color: color || "var(--text)",
          outline: "none",
          padding: 0,
          MozAppearance: "textfield",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }}
      style={{
        cursor: "pointer",
        fontWeight,
        fontSize,
        color: value != null ? color || "var(--text)" : "var(--text-secondary)",
        borderBottom: "1px dashed transparent",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderBottomColor = "var(--primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
      }}
    >
      {value != null ? value : placeholder}
    </span>
  );
}

// ── Exercise name autocomplete ──

function ExerciseNameInput({
  value,
  onChange,
  onSubmit,
  catalog,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  catalog: ExerciseSuggestion[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<ExerciseSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const handleChange = (v: string) => {
    onChange(v);
    if (v.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = v.toLowerCase();
    const matches = catalog
      .filter((e) => e.name.toLowerCase().includes(q) && e.name.toLowerCase() !== q)
      .slice(0, 6);
    setSuggestions(matches);
    setShowDropdown(matches.length > 0);
    setSelectedIdx(-1);
  };

  const selectSuggestion = (name: string) => {
    onChange(name);
    setSuggestions([]);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (showDropdown && selectedIdx >= 0) {
        selectSuggestion(suggestions[selectedIdx].name);
      } else if (value.trim()) {
        onSubmit();
      }
      return;
    }
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => setShowDropdown(false), 150);
  };

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Exercise name"}
        autoFocus={autoFocus}
        className="form-input"
        style={{ fontSize: 13, padding: "6px 10px" }}
      />
      {showDropdown && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            maxHeight: 200,
            overflowY: "auto",
            marginTop: 2,
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s.name}
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s.name); }}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: i === selectedIdx ? "var(--bg-secondary)" : "transparent",
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              {s.muscle_group && (
                <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                  {s.muscle_group}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Set type selector ──

const SET_TYPES = ["working", "warmup", "drop", "failure"] as const;

function SetTypeBadge({ type, onChange }: { type: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const colorMap: Record<string, string> = {
    working: "var(--primary)",
    warmup: "var(--warning)",
    drop: "var(--success)",
    failure: "var(--danger)",
  };

  const label = type === "working" ? "W" : type === "warmup" ? "WU" : type === "drop" ? "D" : type === "failure" ? "F" : type[0].toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colorMap[type] || "var(--text-secondary)",
          cursor: "pointer",
          opacity: 0.7,
          userSelect: "none",
        }}
        title={type}
      >
        {label}
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 100,
            marginTop: 2,
            minWidth: 80,
            overflow: "hidden",
          }}
        >
          {SET_TYPES.map((t) => (
            <div
              key={t}
              onClick={() => { onChange(t); setOpen(false); }}
              style={{
                padding: "5px 10px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: t === type ? 600 : 400,
                color: colorMap[t],
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Set row ──

function SetRow({
  set,
  onUpdate,
  onDelete,
  exerciseName,
}: {
  set: SetData;
  onUpdate: (updates: Partial<SetData>) => void;
  onDelete: () => void;
  exerciseName: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ height: 32 }}
    >
      <td style={{ width: 28, textAlign: "center", color: "var(--text-secondary)", fontSize: 12 }}>
        {set.set_number}
      </td>
      <td style={{ textAlign: "center" }}>
        <EditableNumber
          value={set.reps}
          onChange={(v) => onUpdate({ reps: v ?? 0 })}
          placeholder="—"
          min={0}
          width={36}
        />
      </td>
      <td style={{ textAlign: "center" }}>
        <EditableNumber
          value={set.weight}
          onChange={(v) => onUpdate({ weight: v })}
          placeholder="—"
          min={0}
          step={0.5}
          width={44}
          allowNull
        />
      </td>
      <td style={{ textAlign: "center" }}>
        <EditableNumber
          value={set.rpe}
          onChange={(v) => onUpdate({ rpe: v })}
          placeholder="—"
          min={1}
          width={28}
          allowNull
          color={set.rpe != null ? (set.rpe >= 9 ? "var(--danger)" : set.rpe >= 8 ? "var(--warning)" : "var(--success)") : undefined}
        />
      </td>
      <td style={{ textAlign: "center" }}>
        <SetTypeBadge type={set.set_type || "working"} onChange={(t) => onUpdate({ set_type: t })} />
      </td>
      <td style={{ width: 24, textAlign: "center" }}>
        <span
          onClick={onDelete}
          style={{
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text-secondary)",
            opacity: hovered ? 0.8 : 0,
            transition: "opacity 0.15s",
          }}
          title="Remove set"
        >
          ×
        </span>
      </td>
    </tr>
  );
}

// ── Exercise card ──

function ExerciseCard({
  exercise,
  onRefresh,
  catalog,
}: {
  exercise: ExerciseData;
  onRefresh: () => void;
  catalog: ExerciseSuggestion[];
}) {
  const { callTool, loading } = useCallTool();
  const [hovered, setHovered] = useState(false);
  const [adding, setAdding] = useState(false);
  const pendingUpdates = useRef<Map<number, { timer: ReturnType<typeof setTimeout>; updates: Record<string, number | null> }>>(new Map());

  // Debounced set update
  const updateSet = useCallback(
    (setNumber: number, updates: Partial<SetData>) => {
      const existing = pendingUpdates.current.get(setNumber);
      if (existing) clearTimeout(existing.timer);

      const merged = { ...(existing?.updates || {}), ...updates };
      const timer = setTimeout(async () => {
        pendingUpdates.current.delete(setNumber);
        await callTool("edit_log", {
          exercise: exercise.name,
          action: "update",
          set_numbers: [setNumber],
          updates: merged,
        });
        onRefresh();
      }, 600);

      pendingUpdates.current.set(setNumber, { timer, updates: merged });
    },
    [callTool, exercise.name, onRefresh],
  );

  const deleteSet = useCallback(
    async (setNumber: number) => {
      await callTool("edit_log", {
        exercise: exercise.name,
        action: "delete",
        set_numbers: [setNumber],
      });
      onRefresh();
    },
    [callTool, exercise.name, onRefresh],
  );

  const addSet = useCallback(async () => {
    const lastSet = exercise.sets[exercise.sets.length - 1];
    await callTool("log_workout", {
      exercise: exercise.name,
      reps: lastSet?.reps ?? 10,
      weight: lastSet?.weight ?? null,
      set_type: lastSet?.set_type ?? "working",
    });
    setAdding(false);
    onRefresh();
  }, [callTool, exercise, onRefresh]);

  const deleteExercise = useCallback(async () => {
    await callTool("edit_log", {
      exercise: exercise.name,
      action: "delete",
    });
    onRefresh();
  }, [callTool, exercise.name, onRefresh]);

  const muscle = catalog.find((c) => c.name.toLowerCase() === exercise.name.toLowerCase())?.muscle_group;

  return (
    <div
      className="card"
      style={{ padding: "10px 14px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Exercise header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{exercise.name}</span>
          {muscle && (
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "capitalize", opacity: 0.6 }}>
              {muscle}
            </span>
          )}
        </div>
        <span
          onClick={deleteExercise}
          style={{
            cursor: "pointer",
            fontSize: 14,
            color: "var(--text-secondary)",
            opacity: hovered ? 0.6 : 0,
            transition: "opacity 0.15s",
          }}
          title="Remove exercise"
        >
          ×
        </span>
      </div>

      {/* Sets table */}
      {exercise.sets.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              <th style={{ width: 28, textAlign: "center", padding: "2px 0", fontWeight: 500 }}>#</th>
              <th style={{ textAlign: "center", padding: "2px 0", fontWeight: 500 }}>Reps</th>
              <th style={{ textAlign: "center", padding: "2px 0", fontWeight: 500 }}>Kg</th>
              <th style={{ textAlign: "center", padding: "2px 0", fontWeight: 500 }}>RPE</th>
              <th style={{ textAlign: "center", padding: "2px 0", fontWeight: 500 }}>Type</th>
              <th style={{ width: 24 }} />
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map((set) => (
              <SetRow
                key={set.set_id}
                set={set}
                onUpdate={(updates) => updateSet(set.set_number, updates)}
                onDelete={() => deleteSet(set.set_number)}
                exerciseName={exercise.name}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* Add set */}
      <div style={{ marginTop: 4 }}>
        <span
          onClick={addSet}
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.4 : 0.6,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
        >
          + Add set
        </span>
      </div>
    </div>
  );
}

// ── Add exercise form ──

function AddExerciseForm({
  catalog,
  onAdd,
  onCancel,
}: {
  catalog: ExerciseSuggestion[];
  onAdd: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <ExerciseNameInput
        value={name}
        onChange={setName}
        onSubmit={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }}
        catalog={catalog}
        placeholder="Exercise name..."
        autoFocus
      />
      <button
        className="btn btn-primary"
        style={{ padding: "5px 12px", fontSize: 12, whiteSpace: "nowrap" }}
        onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }}
        disabled={!name.trim()}
      >
        Add
      </button>
      <button
        className="btn"
        style={{ padding: "5px 12px", fontSize: 12 }}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main widget ──

function WorkoutWidget() {
  const data = useToolOutput<ToolData>();
  const { callTool } = useCallTool();
  const [session, setSession] = useState<SessionData | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Initialize from tool output
  useEffect(() => {
    if (data && !initialized) {
      setSession(data.session);
      setInitialized(true);
    }
  }, [data, initialized]);

  const catalog = useMemo(() => data?.exerciseCatalog || [], [data]);

  // Refresh session data
  const refreshSession = useCallback(async () => {
    setRefreshing(true);
    const result = await callTool("get_active_session");
    if (result && result.active) {
      setSession({
        session_id: result.session_id,
        started_at: result.started_at,
        duration_minutes: result.duration_minutes,
        program_day: result.program_day,
        tags: result.tags || [],
        exercises: result.exercises || [],
      });
    } else if (result && !result.active) {
      setSession(null);
    }
    setRefreshing(false);
  }, [callTool]);

  // Add exercise
  const handleAddExercise = useCallback(
    async (name: string) => {
      await callTool("log_workout", {
        exercise: name,
        reps: 10,
        weight: 0,
      });
      setAddingExercise(false);
      await refreshSession();
    },
    [callTool, refreshSession],
  );

  if (!data) return <div className="loading">Loading...</div>;

  if (!session) {
    return (
      <div className="empty" style={{ padding: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No active session</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Start a workout session to track your exercises here.
        </div>
      </div>
    );
  }

  return <ActiveWorkout
    session={session}
    catalog={catalog}
    refreshSession={refreshSession}
    refreshing={refreshing}
    addingExercise={addingExercise}
    setAddingExercise={setAddingExercise}
    handleAddExercise={handleAddExercise}
  />;
}

function ActiveWorkout({
  session,
  catalog,
  refreshSession,
  refreshing,
  addingExercise,
  setAddingExercise,
  handleAddExercise,
}: {
  session: SessionData;
  catalog: ExerciseSuggestion[];
  refreshSession: () => void;
  refreshing: boolean;
  addingExercise: boolean;
  setAddingExercise: (v: boolean) => void;
  handleAddExercise: (name: string) => void;
}) {
  const minutes = useLiveTimer(session.started_at);
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolume = session.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0),
    0,
  );

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 17 }}>Active Workout</span>
            {session.program_day && (
              <span className="badge badge-primary">{session.program_day}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {refreshing && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Refreshing...</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 15, color: "var(--primary)" }}>
              {formatDuration(minutes)}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{session.exercises.length} exercise{session.exercises.length !== 1 ? "s" : ""}</span>
          <span>{totalSets} set{totalSets !== 1 ? "s" : ""}</span>
          {totalVolume > 0 && <span>{Math.round(totalVolume).toLocaleString()} kg vol</span>}
        </div>

        {/* Tags */}
        {session.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {session.tags.map((tag) => (
              <span key={tag} className="badge badge-success" style={{ fontSize: 11 }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Exercise list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {session.exercises.map((ex) => (
          <ExerciseCard
            key={ex.name}
            exercise={ex}
            onRefresh={refreshSession}
            catalog={catalog}
          />
        ))}
      </div>

      {/* Add exercise */}
      <div style={{ marginTop: 8 }}>
        {addingExercise ? (
          <AddExerciseForm
            catalog={catalog}
            onAdd={handleAddExercise}
            onCancel={() => setAddingExercise(false)}
          />
        ) : (
          <span
            onClick={() => setAddingExercise(true)}
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              cursor: "pointer",
              opacity: 0.7,
              transition: "opacity 0.15s",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
          >
            + Add exercise
          </span>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
