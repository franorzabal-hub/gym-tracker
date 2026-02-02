import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import "../styles.css";

// ── Types ──

interface PrevSetData {
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  set_type: string;
}

interface SetData {
  set_id: number;
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  set_type: string;
  logged_at?: string | null;
}

interface ExerciseData {
  name: string;
  superset_group: number | null;
  muscle_group?: string | null;
  exercise_type?: string | null;
  rep_type?: string | null;
  sets: SetData[];
  previous?: { date: string; sets: PrevSetData[] } | null;
  prs?: Record<string, number> | null;
}

interface SessionData {
  session_id: number;
  started_at: string;
  ended_at?: string | null;
  duration_minutes: number;
  program_day: string | null;
  tags: string[];
  exercises: ExerciseData[];
}

interface ExerciseSuggestion {
  name: string;
  muscle_group: string | null;
  rep_type?: string | null;
  exercise_type?: string | null;
}

interface ToolData {
  session: SessionData | null;
  readonly?: boolean;
  exerciseCatalog?: ExerciseSuggestion[];
}

// ── Helpers ──

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
  if (minutes <= 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function isPR(set: SetData, prs: Record<string, number> | null | undefined): string | null {
  if (!prs || !set.weight || set.set_type === "warmup") return null;
  if (prs.max_weight != null && set.weight > prs.max_weight) return "Weight PR";
  const e1rm = set.weight * (1 + (set.reps || 0) / 30);
  if (prs.estimated_1rm != null && e1rm > prs.estimated_1rm) return "1RM PR";
  return null;
}

function weightRange(sets: SetData[]): string {
  const weights = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0);
  if (weights.length === 0) return "bodyweight";
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return min === max ? `${min}kg` : `${min}-${max}kg`;
}

function prevWeightRange(sets: PrevSetData[]): string {
  const weights = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0);
  if (weights.length === 0) return "";
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return min === max ? `${min}kg` : `${min}-${max}kg`;
}

function groupExercises(exercises: ExerciseData[]): { exercises: ExerciseData[]; supersetGroup: number | null }[] {
  const groups: { exercises: ExerciseData[]; supersetGroup: number | null }[] = [];
  let currentGroup: ExerciseData[] = [];
  let currentSupersetGroup: number | null = null;

  for (const ex of exercises) {
    if (ex.superset_group != null && ex.superset_group === currentSupersetGroup) {
      currentGroup.push(ex);
    } else {
      if (currentGroup.length > 0) {
        groups.push({ exercises: currentGroup, supersetGroup: currentSupersetGroup });
      }
      currentGroup = [ex];
      currentSupersetGroup = ex.superset_group;
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ exercises: currentGroup, supersetGroup: currentSupersetGroup });
  }
  return groups;
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
  readonly,
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
  readonly?: boolean;
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

  if (readonly) {
    return (
      <span style={{ fontWeight, fontSize, color: value != null ? color || "var(--text)" : "var(--text-secondary)" }}>
        {value != null ? value : placeholder}
      </span>
    );
  }

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

function SetTypeBadge({ type, onChange, readonly }: { type: string; onChange: (t: string) => void; readonly?: boolean }) {
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
        onClick={readonly ? undefined : () => setOpen(!open)}
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: colorMap[type] || "var(--text-secondary)",
          cursor: readonly ? "default" : "pointer",
          opacity: 0.8,
          userSelect: "none",
          width: 18,
          textAlign: "center",
        }}
        title={type}
      >
        {label}
      </span>
      {open && !readonly && (
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

// ── Rest timer hook ──

function useRestTimer(sets: SetData[], active: boolean) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || sets.length === 0) return null;
  const lastSet = sets[sets.length - 1];
  if (!lastSet.logged_at) return null;

  const elapsed = Math.round((now - new Date(lastSet.logged_at).getTime()) / 1000);
  if (elapsed < 5 || elapsed > 1800) return null;
  return formatRelativeTime(lastSet.logged_at);
}

// ── Set row (flex layout) ──

function SetRow({
  set,
  onUpdate,
  onDelete,
  readonly,
  prevSet,
  prLabel,
}: {
  set: SetData;
  onUpdate: (updates: Partial<SetData>) => void;
  onDelete: () => void;
  readonly?: boolean;
  prevSet?: PrevSetData | null;
  prLabel?: string | null;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        minHeight: 30,
        padding: "2px 0",
      }}
    >
      {/* Set number circle */}
      <span style={{
        width: 20, height: 20, borderRadius: "50%",
        background: "var(--bg)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 600, color: "var(--text-secondary)",
        flexShrink: 0,
      }}>
        {set.set_number}
      </span>

      {/* Set type badge */}
      <SetTypeBadge type={set.set_type || "working"} onChange={(t) => onUpdate({ set_type: t })} readonly={readonly} />

      {/* Reps x Weight */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, minWidth: 0 }}>
        <EditableNumber
          value={set.reps}
          onChange={(v) => onUpdate({ reps: v ?? 0 })}
          placeholder="—"
          min={0}
          width={30}
          readonly={readonly}
        />
        {set.weight != null && (
          <>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 1px" }}>×</span>
            <EditableNumber
              value={set.weight}
              onChange={(v) => onUpdate({ weight: v })}
              placeholder="—"
              min={0}
              step={0.5}
              width={40}
              allowNull
              readonly={readonly}
            />
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>kg</span>
          </>
        )}
        {set.weight == null && !readonly && (
          <>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 1px" }}>×</span>
            <EditableNumber
              value={null}
              onChange={(v) => onUpdate({ weight: v })}
              placeholder="—"
              min={0}
              step={0.5}
              width={40}
              allowNull
              readonly={readonly}
            />
            <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>kg</span>
          </>
        )}
      </div>

      {/* RPE */}
      {(set.rpe != null || !readonly) && (
        <span style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>@</span>
          <EditableNumber
            value={set.rpe}
            onChange={(v) => onUpdate({ rpe: v })}
            placeholder="—"
            min={1}
            width={22}
            fontSize={12}
            allowNull
            color={set.rpe != null ? (set.rpe >= 9 ? "var(--danger)" : set.rpe >= 8 ? "var(--warning)" : "var(--success)") : undefined}
            readonly={readonly}
          />
        </span>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Previous ref */}
      {prevSet && prevSet.weight != null && (
        <span style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.6, whiteSpace: "nowrap" }}>
          prev: {prevSet.weight}×{prevSet.reps}
        </span>
      )}

      {/* PR badge */}
      {prLabel && (
        <span style={{
          fontSize: 9, fontWeight: 700, color: "var(--warning)",
          background: "light-dark(#fef3c7, #451a03)",
          padding: "1px 5px", borderRadius: 4,
          whiteSpace: "nowrap",
        }}>
          PR
        </span>
      )}

      {/* Delete button */}
      {!readonly && (
        <span
          onClick={onDelete}
          style={{
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text-secondary)",
            opacity: hovered ? 0.8 : 0,
            transition: "opacity 0.15s",
            flexShrink: 0,
            width: 16,
            textAlign: "center",
          }}
          title="Remove set"
        >
          ×
        </span>
      )}
    </div>
  );
}

// ── Accordion exercise row ──

function ExerciseAccordionRow({
  exercise,
  expanded,
  onToggle,
  onRefresh,
  catalog,
  readonly,
  active,
}: {
  exercise: ExerciseData;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  catalog: ExerciseSuggestion[];
  readonly?: boolean;
  active?: boolean;
}) {
  const { callTool, loading } = useCallTool();
  const [hovered, setHovered] = useState(false);
  const pendingUpdates = useRef<Map<number, { timer: ReturnType<typeof setTimeout>; updates: Partial<SetData> }>>(new Map());
  const restTimerLabel = useRestTimer(exercise.sets, !!active);
  const muscleColor = exercise.muscle_group ? MUSCLE_COLOR[exercise.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
  const hasPRs = exercise.sets.some(s => isPR(s, exercise.prs) != null);

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

  useEffect(() => {
    return () => {
      pendingUpdates.current.forEach(({ timer }) => clearTimeout(timer));
    };
  }, []);

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
    onRefresh();
  }, [callTool, exercise, onRefresh]);

  const deleteExercise = useCallback(async () => {
    await callTool("edit_log", {
      exercise: exercise.name,
      action: "delete",
    });
    onRefresh();
  }, [callTool, exercise.name, onRefresh]);

  const prevSets = exercise.previous?.sets || [];
  const prevRange = exercise.previous ? prevWeightRange(exercise.previous.sets) : "";

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: "hidden" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Collapsed row — always visible */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.1s",
          background: expanded ? "var(--bg-secondary)" : "transparent",
        }}
      >
        <ExerciseIcon name={exercise.name} color={muscleColor} size={18} />

        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {exercise.name}
        </span>

        {exercise.muscle_group && (
          <span style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 4,
            background: muscleColor + "18",
            color: muscleColor,
            fontWeight: 500,
            textTransform: "capitalize",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {exercise.muscle_group}
          </span>
        )}

        {hasPRs && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: "var(--warning)",
            background: "light-dark(#fef3c7, #451a03)",
            padding: "1px 5px", borderRadius: 4,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            PR
          </span>
        )}

        <span style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {exercise.sets.length} set{exercise.sets.length !== 1 ? "s" : ""}
          {" · "}
          {weightRange(exercise.sets)}
        </span>

        {prevRange && !expanded && (
          <span style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.5, whiteSpace: "nowrap", flexShrink: 0 }}>
            (prev: {prevRange})
          </span>
        )}

        {restTimerLabel && !expanded && (
          <span style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.7, whiteSpace: "nowrap", flexShrink: 0 }}>
            {restTimerLabel}
          </span>
        )}

        <span style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          transition: "transform 0.15s",
          transform: expanded ? "rotate(90deg)" : "none",
          flexShrink: 0,
        }}>
          ▸
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "4px 12px 10px" }}>
          {/* Previous workout summary */}
          {exercise.previous && (
            <div style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.6, marginBottom: 6 }}>
              Previous ({new Date(exercise.previous.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}):
              {" "}{exercise.previous.sets.map((s) =>
                s.weight != null ? `${s.weight}×${s.reps}` : `${s.reps}r`
              ).join(", ")}
            </div>
          )}

          {restTimerLabel && (
            <div style={{ fontSize: 10, color: "var(--text-secondary)", opacity: 0.7, marginBottom: 4 }}>
              Last set: {restTimerLabel}
            </div>
          )}

          {/* Sets */}
          {exercise.sets.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {exercise.sets.map((set) => {
                const matchingPrev = prevSets.find((p) => p.set_number === set.set_number) || null;
                const prLabel = isPR(set, exercise.prs);
                return (
                  <SetRow
                    key={set.set_id}
                    set={set}
                    onUpdate={(updates) => updateSet(set.set_number, updates)}
                    onDelete={() => deleteSet(set.set_number)}
                    readonly={readonly}
                    prevSet={matchingPrev}
                    prLabel={prLabel}
                  />
                );
              })}
            </div>
          )}

          {/* Add set + delete exercise buttons */}
          {!readonly && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <div
                onClick={loading ? undefined : addSet}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  cursor: loading ? "default" : "pointer",
                  border: "1px dashed var(--border)",
                  borderRadius: 6,
                  opacity: loading ? 0.4 : 0.6,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                + Add set
              </div>
              <div
                onClick={deleteExercise}
                style={{
                  padding: "5px 10px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  opacity: hovered ? 0.6 : 0.3,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.opacity = "0.3"; }}
                title="Remove exercise"
              >
                ×
              </div>
            </div>
          )}
        </div>
      )}
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

// ── Superset group wrapper ──

function SupersetWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: "3px solid var(--primary)",
      paddingLeft: 8,
      marginLeft: 2,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--primary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Superset
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
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

  useEffect(() => {
    if (data && !initialized) {
      setSession(data.session);
      setInitialized(true);
    }
  }, [data, initialized]);

  const catalog = useMemo(() => data?.exerciseCatalog || [], [data]);

  const refreshSession = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    const result = await callTool("show_workout", { session_id: session.session_id });
    if (result?.session) {
      setSession(result.session);
    }
    setRefreshing(false);
  }, [callTool, session]);

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
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No workouts yet</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Start your first session to begin tracking your exercises here.
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
    readonly={data?.readonly}
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
  readonly,
}: {
  session: SessionData;
  catalog: ExerciseSuggestion[];
  refreshSession: () => void;
  refreshing: boolean;
  addingExercise: boolean;
  setAddingExercise: (v: boolean) => void;
  handleAddExercise: (name: string) => void;
  readonly?: boolean;
}) {
  const liveMinutes = useLiveTimer(session.started_at);
  const isActive = !readonly && !session.ended_at;
  const minutes = readonly ? session.duration_minutes : liveMinutes;
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolume = session.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0),
    0,
  );

  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  const toggleExercise = useCallback((name: string) => {
    setExpandedExercise(prev => prev === name ? null : name);
  }, []);

  // Collect unique muscle groups
  const muscleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const ex of session.exercises) {
      if (ex.muscle_group) groups.add(ex.muscle_group);
    }
    return Array.from(groups);
  }, [session.exercises]);

  // Group exercises by superset
  const exerciseGroups = useMemo(() => groupExercises(session.exercises), [session.exercises]);

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{readonly ? "Workout" : "Active Workout"}</span>
            {session.program_day && (
              <span className="badge badge-primary" style={{ fontSize: 10 }}>{session.program_day}</span>
            )}
            {readonly && (
              <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", fontSize: 10 }}>
                Completed
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!readonly && refreshing && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>...</span>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: readonly ? "var(--text-secondary)" : "var(--primary)" }}>
              {formatDuration(minutes)}
            </span>
          </div>
        </div>

        {/* Summary stats + muscle groups + tags — all inline */}
        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap", alignItems: "center" }}>
          {readonly && session.ended_at && (
            <span>{new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
          )}
          <span>{session.exercises.length} exercise{session.exercises.length !== 1 ? "s" : ""}</span>
          <span>{totalSets} set{totalSets !== 1 ? "s" : ""}</span>
          {totalVolume > 0 && <span>{Math.round(totalVolume).toLocaleString()} kg</span>}

          {muscleGroups.map((mg) => {
            const c = MUSCLE_COLOR[mg.toLowerCase()] || "var(--text-secondary)";
            return (
              <span key={mg} style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 4,
                background: c + "18",
                color: c,
                fontWeight: 500,
                textTransform: "capitalize",
              }}>
                {mg}
              </span>
            );
          })}

          {session.tags.map((tag) => (
            <span key={tag} className="badge badge-success" style={{ fontSize: 9 }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Exercise accordion */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {exerciseGroups.map((group, gi) => {
          if (group.supersetGroup != null && group.exercises.length > 1) {
            return (
              <SupersetWrapper key={`ss-${gi}`}>
                {group.exercises.map((ex) => (
                  <ExerciseAccordionRow
                    key={ex.name}
                    exercise={ex}
                    expanded={expandedExercise === ex.name}
                    onToggle={() => toggleExercise(ex.name)}
                    onRefresh={refreshSession}
                    catalog={catalog}
                    readonly={readonly}
                    active={isActive}
                  />
                ))}
              </SupersetWrapper>
            );
          }
          return group.exercises.map((ex) => (
            <ExerciseAccordionRow
              key={ex.name}
              exercise={ex}
              expanded={expandedExercise === ex.name}
              onToggle={() => toggleExercise(ex.name)}
              onRefresh={refreshSession}
              catalog={catalog}
              readonly={readonly}
              active={isActive}
            />
          ));
        })}
      </div>

      {/* Add exercise button */}
      {!readonly && (
        <div style={{ marginTop: 6 }}>
          {addingExercise ? (
            <AddExerciseForm
              catalog={catalog}
              onAdd={handleAddExercise}
              onCancel={() => setAddingExercise(false)}
            />
          ) : (
            <div
              onClick={() => setAddingExercise(true)}
              style={{
                padding: "7px 0",
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-secondary)",
                cursor: "pointer",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              + Add exercise
            </div>
          )}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
