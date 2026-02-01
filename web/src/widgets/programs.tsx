import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import {
  type Exercise,
  type Day,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
  SS_COLORS,
  RAIL_PX,
  GROUP_LABELS,
  groupIntoBlocks,
  parseNoteReps,
} from "./shared/program-view.js";

// ── Types ──

interface EditableExercise {
  exercise: string;
  sets: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  superset_group: number | null;
  group_type: "superset" | "paired" | "circuit" | null;
  rest_seconds: number | null;
  notes: string | null;
}

interface EditableDay {
  day_label: string;
  weekdays: number[] | null;
  exercises: EditableExercise[];
}

interface Program {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days: Day[];
}

// ── Auto-save hook ──

type SaveStatus = "idle" | "saving" | "saved" | "error";

function useProgramAutoSave(programId: number | null) {
  const { callTool } = useCallTool();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (programName: string, description: string | null, days: EditableDay[]) => {
      if (!programId) return;

      // Clear pending debounce
      if (timerRef.current) clearTimeout(timerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);

      timerRef.current = setTimeout(async () => {
        setStatus("saving");
        // Filter out exercises with empty names
        const cleanDays = days.map((d) => ({
          day_label: d.day_label,
          weekdays: d.weekdays,
          exercises: d.exercises
            .filter((ex) => ex.exercise.trim() !== "")
            .map((ex) => ({
              exercise: ex.exercise,
              sets: ex.sets,
              reps: ex.reps,
              weight: ex.weight,
              rpe: ex.rpe,
              superset_group: ex.superset_group,
              group_type: ex.group_type,
              rest_seconds: ex.rest_seconds,
              notes: ex.notes,
            })),
        }));

        const result = await callTool("manage_program", {
          action: "patch",
          program_id: programId,
          new_name: programName,
          description: description || "",
          days: cleanDays,
        });

        if (result && !result.error) {
          setStatus("saved");
          statusTimerRef.current = setTimeout(() => setStatus("idle"), 1200);
        } else {
          setStatus("error");
          statusTimerRef.current = setTimeout(() => setStatus("idle"), 2500);
        }
      }, 500);
    },
    [programId, callTool],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  return { save, status };
}

// ── Helper: convert server Day to EditableDay ──

function toEditableDay(day: Day): EditableDay {
  return {
    day_label: day.day_label,
    weekdays: day.weekdays,
    exercises: day.exercises.map((ex) => ({
      exercise: ex.exercise_name,
      sets: ex.target_sets,
      reps: ex.target_reps,
      weight: ex.target_weight,
      rpe: ex.target_rpe,
      superset_group: ex.superset_group,
      group_type: ex.group_type,
      rest_seconds: ex.rest_seconds,
      notes: ex.notes,
    })),
  };
}

// ── Invisible input component ──

function InvisibleInput({
  value,
  onChange,
  onBlur,
  placeholder,
  fontSize = 14,
  fontWeight = 500,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder: string;
  fontSize?: number;
  fontWeight?: number;
  style?: React.CSSProperties;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
      onFocus={(e) => {
        (e.target as HTMLInputElement).style.borderBottomColor = "var(--primary)";
      }}
      onBlurCapture={(e) => {
        (e.target as HTMLInputElement).style.borderBottomColor = "transparent";
      }}
    />
  );
}

// ── Editable number (click-to-edit) ──

function EditableNumber({
  value,
  onChange,
  onBlur,
  placeholder,
  min,
  step,
  width = 36,
  fontWeight = 700,
  fontSize = 13,
  color,
  allowNull,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onBlur?: () => void;
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
    onBlur?.();
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

// ── Helper: get display reps (from notes scheme or target_reps) ──

function getDisplayReps(ex: EditableExercise): string {
  const { repScheme } = parseNoteReps(ex.notes);
  return repScheme || ex.reps.toString();
}

/** Parse reps input: "10" → plain number, "12/10/8" → scheme in notes */
function commitReps(ex: EditableExercise, raw: string): EditableExercise {
  const trimmed = raw.trim();
  if (!trimmed) return ex;

  // Check if it's a per-set scheme like "12/10/8"
  if (/^\d+(?:\/\d+)+$/.test(trimmed)) {
    const firstRep = parseInt(trimmed.split("/")[0], 10);
    // Strip any existing "reps:" from notes, then prepend new one
    const existingNotes = ex.notes
      ? ex.notes.replace(/(?:principal\s*-?\s*)?reps?:\s*[\d]+(?:\/[\d]+)*/i, "").trim()
      : "";
    const newNotes = existingNotes ? `reps: ${trimmed} ${existingNotes}` : `reps: ${trimmed}`;
    return { ...ex, reps: firstRep, notes: newNotes };
  }

  // Plain number
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num > 0) {
    // Remove any existing rep scheme from notes
    const cleanedNotes = ex.notes
      ? ex.notes.replace(/(?:principal\s*-?\s*)?reps?:\s*[\d]+(?:\/[\d]+)*/i, "").trim() || null
      : null;
    return { ...ex, reps: num, notes: cleanedNotes };
  }

  return ex;
}

// ── Exercise name input with autocomplete ──

interface ExerciseSuggestion {
  name: string;
  muscle_group: string | null;
}

function ExerciseNameInput({
  value,
  onChange,
  onBlur,
  autoFocus,
  catalog,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  catalog: ExerciseSuggestion[];
}) {
  const [suggestions, setSuggestions] = useState<ExerciseSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIdx].name);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setShowDropdown(false);
      onBlur?.();
    }, 150);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder="Exercise name"
        autoFocus={autoFocus}
        style={{
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "var(--font)",
          border: "none",
          background: "transparent",
          color: "var(--text)",
          outline: "none",
          padding: 0,
          width: "100%",
          borderBottom: "1.5px solid transparent",
          transition: "border-color 0.15s",
        }}
        onFocusCapture={(e) => {
          (e.target as HTMLInputElement).style.borderBottomColor = "var(--primary)";
        }}
        onBlurCapture={(e) => {
          (e.target as HTMLInputElement).style.borderBottomColor = "transparent";
        }}
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

// ── Editable reps (text input: "10" or "12/10/8") ──

function EditableReps({
  ex,
  onChange,
}: {
  ex: EditableExercise;
  onChange: (updated: EditableExercise) => void;
}) {
  const display = getDisplayReps(ex);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(display);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(display);
  }, [display, editing]);

  const commit = () => {
    setEditing(false);
    onChange(commitReps(ex, local));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="10"
        style={{
          width: 48,
          textAlign: "center",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: "var(--font)",
          border: "none",
          borderBottom: "1.5px solid var(--primary)",
          background: "transparent",
          color: "var(--text)",
          outline: "none",
          padding: 0,
        }}
      />
    );
  }

  const isScheme = display.includes("/");
  return (
    <span
      onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
      style={{
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 13,
        color: "var(--text)",
        borderBottom: "1px dashed transparent",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "var(--primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}
    >
      {isScheme ? `(${display})` : display}
    </span>
  );
}

// ── Editable exercise row ──

function EditableExerciseRow({
  ex,
  onChange,
  onDelete,
  autoFocus,
  catalog,
}: {
  ex: EditableExercise;
  onChange: (updated: EditableExercise) => void;
  onDelete: () => void;
  autoFocus?: boolean;
  catalog: ExerciseSuggestion[];
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ marginBottom: 8, position: "relative", paddingRight: 20 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "0 8px" }}>
        <div style={{ flex: 1, minWidth: 100 }}>
          <ExerciseNameInput
            value={ex.exercise}
            onChange={(v) => onChange({ ...ex, exercise: v })}
            autoFocus={autoFocus}
            catalog={catalog}
          />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {/* Sets */}
          <EditableNumber
            value={ex.sets}
            onChange={(v) => onChange({ ...ex, sets: v ?? 3 })}
            placeholder="3"
            min={1}
          />
          <span style={{ opacity: 0.4 }}>×</span>
          {/* Reps — accepts "10" or "12/10/8" */}
          <EditableReps ex={ex} onChange={onChange} />
          {/* Weight — only if set */}
          {ex.weight != null && (
            <>
              <span style={{ opacity: 0.35, margin: "0 2px" }}>·</span>
              <EditableNumber
                value={ex.weight}
                onChange={(v) => onChange({ ...ex, weight: v })}
                placeholder="kg"
                min={0}
                step={0.5}
                allowNull
              />
              <span style={{ opacity: 0.5, fontSize: 11 }}>kg</span>
            </>
          )}
          {/* RPE — only if set */}
          {ex.rpe != null && (
            <>
              <span style={{ opacity: 0.35, margin: "0 2px" }}>·</span>
              <EditableNumber
                value={ex.rpe}
                onChange={(v) => onChange({ ...ex, rpe: v })}
                placeholder="RPE"
                min={1}
                width={28}
                fontWeight={600}
                color={ex.rpe >= 9 ? "var(--danger)" : ex.rpe >= 8 ? "var(--warning)" : "var(--success)"}
                allowNull
              />
            </>
          )}
          {/* Rest — only if set */}
          {ex.rest_seconds != null && (
            <>
              <span style={{ opacity: 0.25, margin: "0 3px" }}>|</span>
              <span style={{ opacity: 0.6, fontSize: 11 }}>⏱</span>
              <EditableNumber
                value={ex.rest_seconds}
                onChange={(v) => onChange({ ...ex, rest_seconds: v })}
                placeholder="60"
                min={0}
                width={32}
                fontWeight={400}
                fontSize={11}
                allowNull
              />
              <span style={{ opacity: 0.5, fontSize: 10 }}>″</span>
            </>
          )}
          {/* Hover: add weight/RPE/rest if missing */}
          {hovered && ex.weight == null && (
            <span
              onClick={() => onChange({ ...ex, weight: 0 })}
              style={{ opacity: 0.4, cursor: "pointer", fontSize: 10, marginLeft: 3 }}
            >
              +kg
            </span>
          )}
          {hovered && ex.rpe == null && (
            <span
              onClick={() => onChange({ ...ex, rpe: 8 })}
              style={{ opacity: 0.4, cursor: "pointer", fontSize: 10, marginLeft: 3 }}
            >
              +RPE
            </span>
          )}
        </div>
      </div>
      {/* Delete button */}
      <span
        onClick={onDelete}
        style={{
          position: "absolute",
          right: 0,
          top: 2,
          cursor: "pointer",
          fontSize: 14,
          color: "var(--text-secondary)",
          opacity: hovered ? 0.6 : 0,
          transition: "opacity 0.15s",
          lineHeight: 1,
        }}
        title="Remove exercise"
      >
        ×
      </span>
    </div>
  );
}

// ── Add link helper ──

function AddLink({ label, icon, onClick }: { label: string; icon?: string; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 12,
        color: "var(--text-secondary)",
        cursor: "pointer",
        opacity: 0.6,
        transition: "opacity 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
    >
      {icon && <span style={{ marginRight: 2 }}>{icon}</span>}{label}
    </span>
  );
}

// ── Editable day card ──

function EditableDayCard({
  day,
  dayIdx,
  onChange,
  onDelete,
  alwaysExpanded,
  catalog,
}: {
  day: EditableDay;
  dayIdx: number;
  onChange: (updated: EditableDay) => void;
  onDelete: () => void;
  alwaysExpanded?: boolean;
  catalog: ExerciseSuggestion[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [newExIdx, setNewExIdx] = useState<number | null>(null);
  const canCollapse = !alwaysExpanded;

  // Build blocks for display (grouped by superset)
  const viewExercises: Exercise[] = day.exercises.map((ex) => ({
    exercise_name: ex.exercise,
    target_sets: ex.sets,
    target_reps: ex.reps,
    target_weight: ex.weight,
    target_rpe: ex.rpe,
    superset_group: ex.superset_group,
    group_type: ex.group_type,
    rest_seconds: ex.rest_seconds,
    notes: ex.notes,
    muscle_group: null,
    rep_type: null,
  }));
  const blocks = groupIntoBlocks(viewExercises);

  // Map blocks back to exercise indices
  let exIdx = 0;
  const blockIndices: number[][] = blocks.map((block) =>
    block.map(() => exIdx++),
  );

  const ssGroupColors = new Map<number, string>();
  let colorIdx = 0;
  day.exercises.forEach((ex) => {
    if (ex.superset_group != null && !ssGroupColors.has(ex.superset_group)) {
      ssGroupColors.set(ex.superset_group, SS_COLORS[colorIdx % SS_COLORS.length]);
      colorIdx++;
    }
  });

  const weekdayNameList = day.weekdays?.map((w) => WEEKDAY_NAMES[w - 1]).filter(Boolean);
  const titleLabel = weekdayNameList?.length
    ? `${day.day_label} - ${weekdayNameList.join(", ")}`
    : day.day_label;

  const updateExercise = (idx: number, updated: EditableExercise) => {
    const newExercises = [...day.exercises];
    newExercises[idx] = updated;
    onChange({ ...day, exercises: newExercises });
  };

  const deleteExercise = (idx: number) => {
    const newExercises = day.exercises.filter((_, i) => i !== idx);
    onChange({ ...day, exercises: newExercises });
  };

  const addExercise = () => {
    const newEx: EditableExercise = {
      exercise: "",
      sets: 3,
      reps: 10,
      weight: null,
      rpe: null,
      superset_group: null,
      group_type: null,
      rest_seconds: 60,
      notes: null,
    };
    const newExercises = [...day.exercises, newEx];
    setNewExIdx(newExercises.length - 1);
    onChange({ ...day, exercises: newExercises });
  };

  // Next available superset_group number
  const nextGroupNum = useMemo(() => {
    const used = day.exercises.map((e) => e.superset_group).filter((g): g is number => g != null);
    return used.length > 0 ? Math.max(...used) + 1 : 1;
  }, [day.exercises]);

  const addSection = (type: "superset" | "paired" | "circuit") => {
    const groupNum = nextGroupNum;
    const ex1: EditableExercise = {
      exercise: "",
      sets: 3,
      reps: 10,
      weight: null,
      rpe: null,
      superset_group: groupNum,
      group_type: type,
      rest_seconds: 60,
      notes: null,
    };
    const ex2: EditableExercise = { ...ex1 };
    const newExercises = [...day.exercises, ex1, ex2];
    setNewExIdx(newExercises.length - 2);
    onChange({ ...day, exercises: newExercises });
  };

  const addExerciseToGroup = (groupNum: number, groupType: string, afterIdx: number) => {
    const newEx: EditableExercise = {
      exercise: "",
      sets: 3,
      reps: 10,
      weight: null,
      rpe: null,
      superset_group: groupNum,
      group_type: groupType as any,
      rest_seconds: 60,
      notes: null,
    };
    const newExercises = [...day.exercises];
    newExercises.splice(afterIdx + 1, 0, newEx);
    setNewExIdx(afterIdx + 1);
    onChange({ ...day, exercises: newExercises });
  };

  const ungroupBlock = (indices: number[]) => {
    const newExercises = day.exercises.map((ex, i) =>
      indices.includes(i) ? { ...ex, superset_group: null, group_type: null } : ex,
    );
    onChange({ ...day, exercises: newExercises });
  };

  return (
    <div
      style={{
        maxHeight: alwaysExpanded ? "70vh" : undefined,
        overflowY: alwaysExpanded ? "auto" : undefined,
      }}
    >
      {/* Day header */}
      <div
        style={{
          cursor: canCollapse ? "pointer" : "default",
          paddingLeft: RAIL_PX + 2,
          marginBottom: 10,
        }}
        onClick={canCollapse ? () => setExpanded(!expanded) : undefined}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{titleLabel}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canCollapse && (
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {expanded ? "▲" : "▼"}
              </span>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                cursor: "pointer",
                opacity: 0.3,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.3"; }}
              title="Remove day"
            >
              ×
            </span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          {day.exercises.length} ejercicios
        </div>
      </div>

      {expanded && (
        <div>
          {blockIndices.map((indices, blockI) => {
            const block = blocks[blockI];
            const isGrouped = block.length > 1;
            const ssGroup = block[0].superset_group;
            const ssColor = ssGroup != null ? ssGroupColors.get(ssGroup) || null : null;
            const groupType = block[0].group_type || "superset";

            let borderStyle: string;
            if (!isGrouped) {
              borderStyle = "2px solid transparent";
            } else if (groupType === "superset") {
              borderStyle = `2px solid ${ssColor || "var(--text-secondary)"}`;
            } else if (groupType === "paired") {
              borderStyle = "2px dashed var(--border)";
            } else {
              borderStyle = `2px dotted ${ssColor || "var(--border)"}`;
            }

            return (
              <div key={blockI}>
                <div
                  style={{
                    borderLeft: borderStyle,
                    borderBottomLeftRadius: isGrouped ? 8 : 0,
                    paddingLeft: RAIL_PX,
                    marginBottom: 4,
                  }}
                >
                  {isGrouped && (
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: ssColor || "var(--text-secondary)",
                        marginBottom: 4,
                        letterSpacing: "0.5px",
                        opacity: 0.8,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>
                        {(GROUP_LABELS[groupType] || GROUP_LABELS.superset).icon}
                      </span>
                      {(GROUP_LABELS[groupType] || GROUP_LABELS.superset).label}
                      <span
                        onClick={() => ungroupBlock(indices)}
                        style={{
                          marginLeft: 4,
                          cursor: "pointer",
                          fontSize: 10,
                          opacity: 0.5,
                          fontWeight: 400,
                          textTransform: "none",
                          letterSpacing: 0,
                        }}
                        title="Ungroup"
                      >
                        ✕
                      </span>
                    </div>
                  )}
                  {indices.map((eIdx) => (
                    <EditableExerciseRow
                      key={eIdx}
                      ex={day.exercises[eIdx]}
                      onChange={(updated) => updateExercise(eIdx, updated)}
                      onDelete={() => deleteExercise(eIdx)}
                      autoFocus={eIdx === newExIdx}
                      catalog={catalog}
                    />
                  ))}
                  {isGrouped && ssGroup != null && (
                    <div
                      onClick={() => addExerciseToGroup(ssGroup, groupType, indices[indices.length - 1])}
                      style={{
                        fontSize: 11,
                        color: ssColor || "var(--text-secondary)",
                        cursor: "pointer",
                        opacity: 0.5,
                        transition: "opacity 0.15s",
                        marginTop: 2,
                        marginBottom: 4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                    >
                      + add to {(GROUP_LABELS[groupType] || GROUP_LABELS.superset).label.toLowerCase()}
                    </div>
                  )}
                </div>
                {blockI < blockIndices.length - 1 && (
                  <div
                    style={{
                      borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                      marginLeft: RAIL_PX + 2,
                      marginBottom: 10,
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Add exercise / section */}
          <div style={{ paddingLeft: RAIL_PX, marginTop: 8, marginBottom: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AddLink label="+ Exercise" onClick={addExercise} />
            <AddLink label="+ Superset" icon="⚡" onClick={() => addSection("superset")} />
            <AddLink label="+ Paired" icon="🔗" onClick={() => addSection("paired")} />
            <AddLink label="+ Circuit" icon="🔄" onClick={() => addSection("circuit")} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Save indicator ──

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const label =
    status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Error saving";
  const color =
    status === "saving"
      ? "var(--text-secondary)"
      : status === "saved"
        ? "var(--success)"
        : "var(--danger)";

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color,
        transition: "opacity 0.3s",
      }}
    >
      {label}
    </span>
  );
}

// ── Weekday pills: click assigned → navigate, click unassigned → add day ──

function HeaderWeekdayPills({
  days,
  viewingIdx,
  onWeekdayClick,
  onAddDay,
}: {
  days: EditableDay[];
  viewingIdx: number;
  onWeekdayClick: (dayIdx: number) => void;
  onAddDay: (weekdayNum: number) => void;
}) {
  const weekdayToDayIdx = new Map<number, number>();
  days.forEach((d, idx) =>
    d.weekdays?.forEach((w) => {
      if (!weekdayToDayIdx.has(w)) weekdayToDayIdx.set(w, idx);
    }),
  );
  const viewingWeekdays = new Set(days[viewingIdx]?.weekdays || []);

  return (
    <div style={{ display: "flex", gap: 3 }}>
      {WEEKDAY_LABELS.map((label, i) => {
        const dayNum = i + 1;
        const active = weekdayToDayIdx.has(dayNum);
        const viewing = viewingWeekdays.has(dayNum);
        return (
          <div
            key={i}
            onClick={() => {
              if (active) {
                onWeekdayClick(weekdayToDayIdx.get(dayNum)!);
              } else {
                onAddDay(dayNum);
              }
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
              background: active ? "var(--primary)" : "var(--bg-secondary)",
              color: active ? "white" : "var(--text-secondary)",
              border: active ? "none" : "1px solid var(--border)",
              boxShadow: viewing ? "0 0 0 2px var(--bg), 0 0 0 4px var(--primary)" : "none",
              cursor: "pointer",
              transition: "transform 0.1s",
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

// ── Day carousel with touch swipe ──

function EditableDayCarousel({
  days,
  activeIdx,
  goTo,
  onDayChange,
  onDayDelete,
  catalog,
}: {
  days: EditableDay[];
  activeIdx: number;
  goTo: (idx: number) => void;
  onDayChange: (dayIdx: number, updated: EditableDay) => void;
  onDayDelete: (dayIdx: number) => void;
  catalog: ExerciseSuggestion[];
}) {
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      const dy = e.changedTouches[0].clientY - touchRef.current.startY;
      touchRef.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        goTo(activeIdx + (dx < 0 ? 1 : -1));
      }
    },
    [activeIdx, goTo],
  );

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <EditableDayCard
        day={days[activeIdx]}
        dayIdx={activeIdx}
        onChange={(updated) => onDayChange(activeIdx, updated)}
        onDelete={() => onDayDelete(activeIdx)}
        alwaysExpanded
        catalog={catalog}
      />
    </div>
  );
}

// ── Main widget ──

function ProgramsWidget() {
  const data = useToolOutput<{ program: Program; initialDayIdx?: number; exerciseCatalog?: ExerciseSuggestion[] }>();
  const [programName, setProgramName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [days, setDays] = useState<EditableDay[]>([]);
  const [programId, setProgramId] = useState<number | null>(null);
  const [viewingIdx, setViewingIdx] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const { save, status } = useProgramAutoSave(programId);

  // Initialize from tool output
  useEffect(() => {
    if (data?.program && !initialized) {
      const p = data.program;
      setProgramId(p.id);
      setProgramName(p.name);
      setDescription(p.description);
      setDays(p.days.map(toEditableDay));
      setViewingIdx(data.initialDayIdx || 0);
      setInitialized(true);
    }
  }, [data, initialized]);

  // Trigger save on any change (after init)
  const triggerSave = useCallback(
    (name: string, desc: string | null, d: EditableDay[]) => {
      save(name, desc, d);
    },
    [save],
  );

  const goTo = useCallback(
    (idx: number) => {
      setViewingIdx(Math.max(0, Math.min(idx, days.length - 1)));
    },
    [days.length],
  );

  const handleNameChange = (v: string) => {
    setProgramName(v);
  };
  const handleNameBlur = () => {
    if (programName.trim()) triggerSave(programName, description, days);
  };

  const handleDescChange = (v: string) => {
    setDescription(v);
  };
  const handleDescBlur = () => {
    triggerSave(programName, description, days);
  };

  const handleDayChange = (dayIdx: number, updated: EditableDay) => {
    const newDays = [...days];
    newDays[dayIdx] = updated;
    setDays(newDays);
    triggerSave(programName, description, newDays);
  };

  const handleDayDelete = (dayIdx: number) => {
    if (days.length <= 1) return; // Keep at least 1 day
    const newDays = days.filter((_, i) => i !== dayIdx);
    setDays(newDays);
    if (viewingIdx >= newDays.length) setViewingIdx(newDays.length - 1);
    triggerSave(programName, description, newDays);
  };

  const handleAddDay = (weekdayNum: number) => {
    const dayName = WEEKDAY_NAMES[weekdayNum - 1];
    const newDay: EditableDay = {
      day_label: `Day ${days.length + 1} - ${dayName}`,
      weekdays: [weekdayNum],
      exercises: [],
    };
    const newDays = [...days, newDay];
    setDays(newDays);
    setViewingIdx(newDays.length - 1);
    triggerSave(programName, description, newDays);
  };

  if (!data) return <div className="loading">Loading...</div>;

  const p = data.program;
  if (!p) return <div className="empty">No program found</div>;
  if (!initialized || days.length === 0) return <div className="loading">Loading...</div>;

  const totalExercises = days.reduce((sum, d) => sum + d.exercises.length, 0);
  const catalog = data?.exerciseCatalog || [];

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Program header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <InvisibleInput
              value={programName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              placeholder="Program name"
              fontSize={18}
              fontWeight={600}
            />
          </div>
          <SaveIndicator status={status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <InvisibleInput
              value={description || ""}
              onChange={handleDescChange}
              onBlur={handleDescBlur}
              placeholder="Add description..."
              fontSize={13}
              fontWeight={400}
              style={{ color: "var(--text-secondary)" }}
            />
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {days.length} days · {totalExercises} exercises
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <HeaderWeekdayPills days={days} viewingIdx={viewingIdx} onWeekdayClick={goTo} onAddDay={handleAddDay} />
        </div>
      </div>

      {days.length === 1 ? (
        <EditableDayCard
          day={days[0]}
          dayIdx={0}
          onChange={(updated) => handleDayChange(0, updated)}
          onDelete={() => handleDayDelete(0)}
          alwaysExpanded
          catalog={catalog}
        />
      ) : (
        <EditableDayCarousel
          days={days}
          activeIdx={viewingIdx}
          goTo={goTo}
          onDayChange={handleDayChange}
          onDayDelete={handleDayDelete}
          catalog={catalog}
        />
      )}

    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <ProgramsWidget />
  </AppProvider>,
);
