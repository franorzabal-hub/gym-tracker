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
  RAIL_PX,
  GROUP_LABELS,
  groupIntoBlocks,
  parseNoteReps,
} from "./shared/program-view.js";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// ── Block model for DnD ──

interface Block {
  id: string;
  groupType: "superset" | "paired" | "circuit" | null;
  supersetGroup: number | null;
  exercises: EditableExercise[];
}

function exercisesToBlocks(exercises: EditableExercise[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  let blockIdx = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.superset_group != null) {
      const group = ex.superset_group;
      const blockExercises: EditableExercise[] = [];
      while (i < exercises.length && exercises[i].superset_group === group) {
        blockExercises.push(exercises[i]);
        i++;
      }
      blocks.push({
        id: `block-${blockIdx}`,
        groupType: blockExercises[0].group_type,
        supersetGroup: group,
        exercises: blockExercises,
      });
    } else {
      blocks.push({
        id: `block-${blockIdx}`,
        groupType: null,
        supersetGroup: null,
        exercises: [ex],
      });
      i++;
    }
    blockIdx++;
  }
  return blocks;
}

function blocksToExercises(blocks: Block[]): EditableExercise[] {
  const exercises: EditableExercise[] = [];
  let groupNum = 1;
  for (const block of blocks) {
    if (block.groupType) {
      for (const ex of block.exercises) {
        exercises.push({
          ...ex,
          superset_group: groupNum,
          group_type: block.groupType,
        });
      }
      groupNum++;
    } else {
      for (const ex of block.exercises) {
        exercises.push({
          ...ex,
          superset_group: null,
          group_type: null,
        });
      }
    }
  }
  return exercises;
}

// ── Active columns: which optional fields are used by any exercise in the day ──

interface ActiveColumns {
  weight: boolean;
  rpe: boolean;
  rest: boolean;
}

// ── Sortable exercise row wrapper ──

function SortableExerciseItem({
  id,
  ex,
  onChange,
  onDelete,
  autoFocus,
  catalog,
  isGrouped,
  onGroup,
  onUngroup,
  adjacentGroups,
  activeColumns,
}: {
  id: string;
  ex: EditableExercise;
  onChange: (updated: EditableExercise) => void;
  onDelete: () => void;
  autoFocus?: boolean;
  catalog: ExerciseSuggestion[];
  isGrouped?: boolean;
  onGroup?: (type: "superset" | "paired" | "circuit") => void;
  onUngroup?: () => void;
  adjacentGroups?: AdjacentGroupInfo[];
  activeColumns: ActiveColumns;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <EditableExerciseRow
        ex={ex}
        onChange={onChange}
        onDelete={onDelete}
        autoFocus={autoFocus}
        catalog={catalog}
        isGrouped={isGrouped}
        onGroup={onGroup}
        onUngroup={onUngroup}
        adjacentGroups={adjacentGroups}
        activeColumns={activeColumns}
        dragHandleProps={{ attributes, listeners }}
      />
    </div>
  );
}

// ── Sortable block wrapper ──

function SortableBlockItem({
  id,
  children,
  isGrouped,
  groupLabel,
  onUngroup,
  onAddToGroup,
  onDeleteBlock,
}: {
  id: string;
  children: (dragHeader: React.ReactNode) => React.ReactNode;
  isGrouped: boolean;
  groupLabel?: React.ReactNode;
  onUngroup?: () => void;
  onAddToGroup?: () => void;
  onDeleteBlock?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const [railHovered, setRailHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
  };

  const dragHeader = isGrouped && groupLabel ? (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 4 }}>
      {groupLabel}
      <div ref={menuRef} style={{ position: "relative", marginLeft: 2 }}>
        <span
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            cursor: "pointer",
            fontSize: 14,
            opacity: 0.5,
            color: "var(--text-secondary)",
            padding: "2px 4px",
            transition: "opacity 0.15s",
            userSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
          title="Group actions"
        >
          ⋮
        </span>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
              zIndex: 100,
              marginTop: 4,
              minWidth: 150,
              padding: "4px 0",
            }}
          >
            {onAddToGroup && (
              <div
                style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", color: "var(--text)", borderRadius: 4, margin: "1px 4px" }}
                onClick={() => { onAddToGroup(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ width: 16, textAlign: "center", fontSize: 12, flexShrink: 0, opacity: 0.6 }}>+</span> Add exercise
              </div>
            )}
            {onUngroup && (
              <div
                style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", color: "var(--text)", borderRadius: 4, margin: "1px 4px" }}
                onClick={() => { onUngroup(); setMenuOpen(false); }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ width: 16, textAlign: "center", fontSize: 12, flexShrink: 0, opacity: 0.6 }}>↗</span> Ungroup
              </div>
            )}
            {onDeleteBlock && (
              <>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 8px" }} />
                <div style={{ background: "color-mix(in srgb, var(--danger, #e74c3c) 5%, transparent)", borderRadius: "0 0 6px 6px", padding: "2px 0" }}>
                  <div
                    style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", color: "var(--danger, #e74c3c)", borderRadius: 4, margin: "1px 4px" }}
                    onClick={() => { onDeleteBlock(); setMenuOpen(false); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span style={{ width: 16, textAlign: "center", fontSize: 12, flexShrink: 0 }}>×</span> Delete block
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Full-height drag rail along the left border
  const blockDragHandle = isGrouped ? (
    <div
      {...attributes}
      {...listeners}
      onMouseEnter={() => setRailHovered(true)}
      onMouseLeave={() => setRailHovered(false)}
      style={{
        position: "absolute",
        left: -8,
        top: 0,
        bottom: 0,
        width: 16,
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          opacity: railHovered ? 0.6 : 0,
          transition: "opacity 0.15s",
          fontSize: 11,
          color: "var(--text-secondary)",
          background: "var(--bg, #fff)",
          padding: "2px 0",
          lineHeight: 1,
        }}
      >
        ⠿
      </span>
    </div>
  ) : null;

  return (
    <div ref={setNodeRef} style={style}>
      {blockDragHandle}
      {children(dragHeader)}
    </div>
  );
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
        transition: "border-color 0.15s, background 0.15s",
        padding: "1px 3px",
        borderRadius: 4,
        margin: "-1px -3px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderBottomColor = "var(--primary)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
        (e.currentTarget as HTMLElement).style.background = "transparent";
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

// ── Muscle group colors ──

const MUSCLE_COLOR: Record<string, string> = {
  chest: "#e74c3c",
  back: "#3498db",
  shoulders: "#e67e22",
  biceps: "#9b59b6",
  triceps: "#8e44ad",
  quads: "#27ae60",
  quadriceps: "#27ae60",
  hamstrings: "#2ecc71",
  glutes: "#e91e63",
  calves: "#16a085",
  abs: "#f39c12",
  core: "#f39c12",
  traps: "#d35400",
  "rear delts": "#e67e22",
  cardio: "#e74c3c",
  mobility: "#95a5a6",
};

// ── Exercise movement SVG icons (stick-figure silhouettes) ──
// Hardcoded SVG path data for each movement pattern.

type SvgPathData = { d: string }[];

const EXERCISE_SVGS: Record<string, SvgPathData> = {
  bench: [{ d: "M3 14h14M6 14v-2M14 14v-2M7 12h6M10 12V8M7 8h6M6 6l1 2M14 6l-1 2M10 8V6" }],
  press: [{ d: "M10 18v-6M8 18h4M10 12V8M10 6a2 2 0 100-4 2 2 0 000 4M6 8h8M5 4h2M13 4h2M6 8l-1-4M14 8l1-4" }],
  squat: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4v4M7 8l-2 5h2l1-2M13 8l2 5h-2l-1-2M8 13v5M12 13v5M6 6h8" }],
  deadlift: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4l-1 5M9 9l-2 4v5M9 9l4 0M13 9l-1 4v5M5 17h10M7 17v1M13 17v1" }],
  row: [{ d: "M10 3a2 2 0 100-4 2 2 0 000 4M10 3l-2 6M8 9v6M8 9l5 1M13 10v5M5 15h10M6 9l-2 2M14 10l2-1" }],
  pullup: [{ d: "M4 2h12M10 5a2 2 0 100-4 2 2 0 000 4M10 5v5M7 2l3 3M13 2l-3 3M8 10l-1 4v4M12 10l1 4v4" }],
  curl: [{ d: "M8 16v-4l2-3 2-1v-3M12 5a1.5 1.5 0 10-3 0M8 16h4M6 16h8" }],
  extension: [{ d: "M10 18v-6M8 18h4M10 12V7M10 5a2 2 0 100-4 2 2 0 000 4M7 7l3-2 3 2M13 7l1-4M14 3h2" }],
  lateral: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M8 18h4M10 12l-2 6M10 12l2 6M10 8l-6 0M10 8l6 0M4 7v2M16 7v2" }],
  plank: [{ d: "M3 12h2l2-2h6l2 2h2M7 10l-1-4M10 10V5M10 5a2 2 0 100-4 2 2 0 000 4M5 12v2M15 12v2" }],
  lunge: [{ d: "M10 4a2 2 0 100-4 2 2 0 000 4M10 4v5M10 9l-4 5v4M10 9l3 3v6M6 14l-2 1M6 18h2M13 18h2" }],
  calfraise: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v7M8 13l-1 3M12 13l1 3M7 16l1 2M13 16l-1 2M8 18h4" }],
  fly: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-2 6M10 12l2 6M8 18h4M10 8l-5-1M10 8l5-1M5 7a1 1 0 110-2M15 7a1 1 0 100-2" }],
  shrug: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-2 6M10 12l2 6M8 18h4M7 7l-2 0v5M13 7l2 0v5M5 12h2M13 12h2" }],
  dip: [{ d: "M10 5a2 2 0 100-4 2 2 0 000 4M10 5v5M4 8h4M12 8h4M10 10l-2 4v4M10 10l2 4v4M8 18h4" }],
  generic: [{ d: "M10 6a2 2 0 100-4 2 2 0 000 4M10 6v6M10 12l-3 6M10 12l3 6M7 18h2M11 18h2M7 9h6" }],
};

const EXERCISE_ICON_MAP: Record<string, string> = {
  "bench press": "bench", "press banca": "bench", "press plano": "bench",
  "incline bench press": "bench", "press inclinado": "bench",
  "dumbbell bench press": "bench", "close-grip bench press": "bench",
  "push pecho": "bench",
  "cable fly": "fly", "dumbbell fly": "fly",
  "overhead press": "press", "press militar": "press", "ohp": "press",
  "dumbbell overhead press": "press",
  "squat": "squat", "front squat": "squat", "sentadilla": "squat",
  "leg press": "squat", "prensa": "squat",
  "deadlift": "deadlift", "sumo deadlift": "deadlift",
  "romanian deadlift": "deadlift", "peso muerto": "deadlift", "rdl": "deadlift",
  "hip thrust": "deadlift",
  "barbell row": "row", "dumbbell row": "row", "seated cable row": "row",
  "t-bar row": "row", "remo": "row", "remo maquina": "row",
  "remo en polea": "row", "remo sentado": "row", "remo t-bar": "row",
  "remo con mancuerna": "row",
  "pull-up": "pullup", "chin-up": "pullup", "dominadas": "pullup",
  "lat pulldown": "pullup", "dorsalera": "pullup",
  "jalón al pecho": "pullup", "jalón polea": "pullup",
  "barbell curl": "curl", "hammer curl": "curl", "preacher curl": "curl",
  "incline dumbbell curl": "curl", "concentration curl": "curl",
  "cable curl": "curl", "curl": "curl",
  "tricep pushdown": "extension", "skull crusher": "extension",
  "overhead tricep extension": "extension",
  "dumbbell lateral raise": "lateral", "elevaciones laterales": "lateral",
  "lateral raise": "lateral", "laterales": "lateral",
  "face pull": "lateral", "rear delt fly": "lateral",
  "dip": "dip", "fondos": "dip",
  "barbell lunge": "lunge", "lunge": "lunge", "zancada": "lunge",
  "leg extension": "lunge", "leg curl": "lunge",
  "calf raise": "calfraise", "seated calf raise": "calfraise",
  "plancha lateral": "plank", "plancha": "plank", "plank": "plank",
  "cable crunch": "plank", "bicho muerto": "plank", "dead bug": "plank",
  "barbell shrug": "shrug", "shrug": "shrug",
};

function ExerciseIcon({ name, color, size = 18 }: { name: string; color?: string; size?: number }) {
  const key = EXERCISE_ICON_MAP[name.toLowerCase()] || null;
  const paths = key ? EXERCISE_SVGS[key] : EXERCISE_SVGS.generic;
  if (!name.trim()) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      style={{ color: color || "var(--text-secondary)", flexShrink: 0, opacity: 0.7 }}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
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
        transition: "border-color 0.15s, background 0.15s",
        padding: "1px 3px",
        borderRadius: 4,
        margin: "-1px -3px",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = "var(--primary)"; e.currentTarget.style.background = "var(--bg-secondary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
    >
      {isScheme ? `(${display})` : display}
    </span>
  );
}

// ── Toggleable field item (active fields in menu) ──

function ToggleableFieldItem({
  label,
  onToggleOff,
  itemStyle,
  iconStyle,
}: {
  label: string;
  onToggleOff: () => void;
  itemStyle: React.CSSProperties;
  iconStyle: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        ...itemStyle,
        cursor: "pointer",
        color: "var(--text-secondary)",
        opacity: hovered ? 0.7 : 0.5,
      }}
      onClick={onToggleOff}
      onMouseEnter={(e) => { setHovered(true); (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)"; }}
      onMouseLeave={(e) => { setHovered(false); (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={iconStyle}>✓</span> {label}
    </div>
  );
}

// ── Editable exercise row ──

interface AdjacentGroupInfo {
  direction: "above" | "below";
  label: string;
  onJoin: () => void;
}

function EditableExerciseRow({
  ex,
  onChange,
  onDelete,
  autoFocus,
  catalog,
  isGrouped,
  onGroup,
  onUngroup,
  adjacentGroups,
  activeColumns,
  dragHandleProps,
}: {
  ex: EditableExercise;
  onChange: (updated: EditableExercise) => void;
  onDelete: () => void;
  autoFocus?: boolean;
  catalog: ExerciseSuggestion[];
  isGrouped?: boolean;
  onGroup?: (type: "superset" | "paired" | "circuit") => void;
  onUngroup?: () => void;
  adjacentGroups?: AdjacentGroupInfo[];
  activeColumns: ActiveColumns;
  dragHandleProps?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined };
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const showActions = hovered || menuOpen;

  return (
    <div
      style={{ marginBottom: 8, position: "relative", paddingRight: 32 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {/* Drag handle */}
        {dragHandleProps && (
          <span
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            style={{ flexShrink: 0 }}
          >
            <span
              style={{
                cursor: "grab",
                color: "var(--text-secondary)",
                opacity: 0.45,
                fontSize: 14,
                lineHeight: 1,
                userSelect: "none",
                touchAction: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              ⠿
            </span>
          </span>
        )}
        {/* Icon */}
        {(() => {
          const mg = catalog.find((c) => c.name.toLowerCase() === ex.exercise.toLowerCase())?.muscle_group;
          const color = mg ? MUSCLE_COLOR[mg.toLowerCase()] : undefined;
          return ex.exercise.trim() ? <ExerciseIcon name={ex.exercise} color={color} size={18} /> : null;
        })()}
        {/* Name + muscle chip */}
        <div style={{ flex: "1 1 0", minWidth: 60, maxWidth: "50%", display: "flex", alignItems: "center", gap: 4 }}>
          <ExerciseNameInput
            value={ex.exercise}
            onChange={(v) => onChange({ ...ex, exercise: v })}
            autoFocus={autoFocus}
            catalog={catalog}
          />
          {(() => {
            const mg = catalog.find((c) => c.name.toLowerCase() === ex.exercise.toLowerCase())?.muscle_group;
            return mg ? (
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                color: "var(--text-secondary)",
                background: "var(--border)",
                padding: "1px 5px",
                borderRadius: 8,
                textTransform: "capitalize",
                whiteSpace: "nowrap",
                lineHeight: "16px",
                flexShrink: 0,
              }}>{mg}</span>
            ) : null;
          })()}
        </div>
        {/* Sets × Reps · Weight — grid layout for column alignment */}
        {(() => {
          // Build grid columns: sets(20) ×(16) reps(auto) [· weight kg] [· rpe] [| ⏱ rest ″]
          const cols = ["20px", "16px", "auto"];
          if (activeColumns.weight) cols.push("16px", "auto", "auto"); // · weight kg
          if (activeColumns.rpe) cols.push("16px", "auto"); // · rpe
          if (activeColumns.rest) cols.push("16px", "auto", "4px", "auto", "auto"); // | ⏱ gap rest ″
          return (
            <div style={{ display: "grid", gridTemplateColumns: cols.join(" "), alignItems: "baseline", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0, marginLeft: "auto" }}>
              {/* Sets */}
              <span style={{ textAlign: "right" }}>
                <EditableNumber value={ex.sets} onChange={(v) => onChange({ ...ex, sets: v ?? 3 })} placeholder="3" min={1} width={20} />
              </span>
              <span style={{ textAlign: "center", opacity: 0.4 }}>×</span>
              {/* Reps */}
              <span style={{ textAlign: "center" }}>
                <EditableReps ex={ex} onChange={onChange} />
              </span>
              {/* Weight columns */}
              {activeColumns.weight && (
                ex.weight != null ? (<>
                  <span style={{ textAlign: "center", opacity: 0.35 }}>·</span>
                  <span style={{ textAlign: "right" }}>
                    <EditableNumber value={ex.weight} onChange={(v) => onChange({ ...ex, weight: v })} placeholder="kg" min={0} step={0.5} width={36} allowNull />
                  </span>
                  <span style={{ opacity: 0.5, fontSize: 11 }}>kg</span>
                </>) : (<>
                  <span /><span /><span />
                </>)
              )}
              {/* RPE columns */}
              {activeColumns.rpe && (
                ex.rpe != null ? (<>
                  <span style={{ textAlign: "center", opacity: 0.35 }}>·</span>
                  <span>
                    <EditableNumber value={ex.rpe} onChange={(v) => onChange({ ...ex, rpe: v })} placeholder="RPE" min={1} width={28} fontWeight={600} color={ex.rpe >= 9 ? "var(--danger)" : ex.rpe >= 8 ? "var(--warning)" : "var(--success)"} allowNull />
                  </span>
                </>) : (<>
                  <span /><span />
                </>)
              )}
              {/* Rest columns */}
              {activeColumns.rest && (
                ex.rest_seconds != null ? (<>
                  <span style={{ textAlign: "center", opacity: 0.25 }}>|</span>
                  <span style={{ opacity: 0.6, fontSize: 11 }}>⏱</span>
                  <span />
                  <span>
                    <EditableNumber value={ex.rest_seconds} onChange={(v) => onChange({ ...ex, rest_seconds: v })} placeholder="60" min={0} width={32} fontWeight={400} fontSize={11} allowNull />
                  </span>
                  <span style={{ opacity: 0.5, fontSize: 10 }}>″</span>
                </>) : (<>
                  <span /><span /><span /><span /><span />
                </>)
              )}
            </div>
          );
        })()}
      </div>
      {/* Action menu (top-right) */}
      <div
        ref={menuRef}
        style={{
          position: "absolute",
          right: 0,
          top: 2,
          opacity: showActions ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: showActions ? "auto" : "none",
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            cursor: "pointer",
            fontSize: 14,
            color: "var(--text-secondary)",
            opacity: 0.4,
            transition: "opacity 0.15s",
            lineHeight: 1,
            userSelect: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; }}
          title="Actions"
        >
          ⋮
        </span>
        {menuOpen && (() => {
          const itemStyle: React.CSSProperties = {
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            color: "var(--text)",
            borderRadius: 4,
            margin: "1px 4px",
          };
          const iconStyle: React.CSSProperties = {
            width: 16,
            textAlign: "center",
            fontSize: 12,
            flexShrink: 0,
            opacity: 0.6,
          };
          const hoverOn = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-secondary)"; };
          const hoverOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "transparent"; };
          const sep = <div style={{ borderTop: "1px solid var(--border)", margin: "4px 8px" }} />;

          return (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
                zIndex: 100,
                marginTop: 4,
                minWidth: 160,
                padding: "4px 0",
              }}
            >
              {/* Add fields section — shows all 3, active ones have ✓ */}
              <div style={{ padding: "4px 12px 2px", fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Fields
              </div>
              {ex.weight != null ? (
                <ToggleableFieldItem
                  label="Weight (kg)"
                  onToggleOff={() => { onChange({ ...ex, weight: null }); setMenuOpen(false); }}
                  itemStyle={itemStyle}
                  iconStyle={iconStyle}
                />
              ) : (
                <div style={itemStyle} onClick={() => { onChange({ ...ex, weight: 0 }); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  <span style={iconStyle}>⏲</span> Weight (kg)
                </div>
              )}
              {ex.rpe != null ? (
                <ToggleableFieldItem
                  label="RPE"
                  onToggleOff={() => { onChange({ ...ex, rpe: null }); setMenuOpen(false); }}
                  itemStyle={itemStyle}
                  iconStyle={iconStyle}
                />
              ) : (
                <div style={itemStyle} onClick={() => { onChange({ ...ex, rpe: 8 }); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  <span style={iconStyle}>◎</span> RPE
                </div>
              )}
              {ex.rest_seconds != null ? (
                <ToggleableFieldItem
                  label="Rest time"
                  onToggleOff={() => { onChange({ ...ex, rest_seconds: null }); setMenuOpen(false); }}
                  itemStyle={itemStyle}
                  iconStyle={iconStyle}
                />
              ) : (
                <div style={itemStyle} onClick={() => { onChange({ ...ex, rest_seconds: 60 }); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                  <span style={iconStyle}>⏱</span> Rest time
                </div>
              )}
              {sep}

              {/* Group/ungroup options */}
              {onGroup && onUngroup && (
                isGrouped ? (
                  <>
                    <div style={itemStyle} onClick={() => { onUngroup(); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                      <span style={iconStyle}>↗</span> Remove from group
                    </div>
                    {sep}
                  </>
                ) : (
                  <>
                    {adjacentGroups?.map((ag) => (
                      <div key={ag.direction} style={itemStyle} onClick={() => { ag.onJoin(); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                        <span style={iconStyle}>{ag.direction === "above" ? "↑" : "↓"}</span>
                        Join {ag.label} {ag.direction}
                      </div>
                    ))}
                    {(["superset", "paired", "circuit"] as const).map((type) => (
                      <div key={type} style={itemStyle} onClick={() => { onGroup(type); setMenuOpen(false); }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
                        <span style={iconStyle}>{GROUP_LABELS[type].icon}</span>
                        New {GROUP_LABELS[type].label.toLowerCase()}
                      </div>
                    ))}
                    {sep}
                  </>
                )
              )}

              {/* Delete */}
              <div style={{ background: "color-mix(in srgb, var(--danger, #e74c3c) 5%, transparent)", borderRadius: "0 0 6px 6px", padding: "2px 0" }}>
                <div
                  style={{ ...itemStyle, color: "var(--danger, #e74c3c)" }}
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  onMouseEnter={hoverOn}
                  onMouseLeave={hoverOff}
                >
                  <span style={{ ...iconStyle, opacity: 1 }}>×</span> Delete exercise
                </div>
              </div>
            </div>
          );
        })()}
      </div>
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Build blocks from exercises
  const blocks = useMemo(() => exercisesToBlocks(day.exercises), [day.exercises]);

  // Generate stable exercise IDs per block for sortable
  const exerciseIds = useMemo(() => {
    const ids: Map<string, string[]> = new Map();
    blocks.forEach((block) => {
      ids.set(
        block.id,
        block.exercises.map((_, i) => `${block.id}-ex-${i}`),
      );
    });
    return ids;
  }, [blocks]);

  const blockIds = useMemo(() => blocks.map((b) => b.id), [blocks]);

  // Structural color for all group elements (monochromatic)
  const groupColor = "var(--text-secondary)";

  // Compute which optional columns any exercise uses (for vertical alignment)
  const activeColumns = useMemo<ActiveColumns>(() => ({
    weight: day.exercises.some((e) => e.weight != null),
    rpe: day.exercises.some((e) => e.rpe != null),
    rest: day.exercises.some((e) => e.rest_seconds != null),
  }), [day.exercises]);

  const estimatedMinutes = Math.round(
    day.exercises.reduce((total, ex) => {
      const workPerSet = 40;
      const rest = ex.rest_seconds || 60;
      const sets = ex.sets || 3;
      return total + sets * workPerSet + (sets - 1) * rest;
    }, 0) / 60
  );
  const catalogMap = useMemo(() => {
    const m = new Map<string, string>();
    catalog.forEach((c) => { if (c.muscle_group) m.set(c.name.toLowerCase(), c.muscle_group); });
    return m;
  }, [catalog]);
  const muscleGroups = [...new Set(
    day.exercises.map((e) => catalogMap.get(e.exercise.toLowerCase())).filter(Boolean)
  )] as string[];

  const weekdayNameList = day.weekdays?.map((w) => WEEKDAY_NAMES[w - 1]).filter(Boolean);
  const titleLabel = weekdayNameList?.length
    ? `${day.day_label} - ${weekdayNameList.join(", ")}`
    : day.day_label;

  // Commit blocks back to flat exercises and call onChange
  const commitBlocks = useCallback(
    (newBlocks: Block[]) => {
      onChange({ ...day, exercises: blocksToExercises(newBlocks) });
    },
    [day, onChange],
  );

  const updateExerciseInBlock = (blockIdx: number, exIdx: number, updated: EditableExercise) => {
    const newBlocks = blocks.map((b, bi) => {
      if (bi !== blockIdx) return b;
      const newExs = [...b.exercises];
      newExs[exIdx] = updated;
      return { ...b, exercises: newExs };
    });
    commitBlocks(newBlocks);
  };

  const deleteExerciseInBlock = (blockIdx: number, exIdx: number) => {
    const newBlocks = blocks
      .map((b, bi) => {
        if (bi !== blockIdx) return b;
        const newExs = b.exercises.filter((_, i) => i !== exIdx);
        if (newExs.length === 0) return null;
        // Auto-ungroup if block drops to 1 exercise
        if (newExs.length === 1) {
          return { ...b, exercises: newExs, groupType: null, supersetGroup: null } as Block;
        }
        return { ...b, exercises: newExs };
      })
      .filter((b): b is Block => b !== null);
    commitBlocks(newBlocks);
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
    const newExercises = [...day.exercises, ex1];
    setNewExIdx(newExercises.length - 1);
    onChange({ ...day, exercises: newExercises });
  };

  const deleteBlock = (blockIdx: number) => {
    commitBlocks(blocks.filter((_, i) => i !== blockIdx));
  };

  const ungroupBlock = (blockIdx: number) => {
    const block = blocks[blockIdx];
    // If all exercises in the block are empty, remove the entire block
    const allEmpty = block.exercises.every((ex) => ex.exercise.trim() === "");
    if (allEmpty) {
      commitBlocks(blocks.filter((_, i) => i !== blockIdx));
      return;
    }
    // Otherwise just ungroup (keep exercises as solo)
    const newBlocks = blocks.map((b, bi) => {
      if (bi !== blockIdx) return b;
      return { ...b, groupType: null, supersetGroup: null } as Block;
    });
    commitBlocks(newBlocks);
  };

  // Group a solo exercise's block into a group type
  const groupExercise = (blockIdx: number, type: "superset" | "paired" | "circuit") => {
    const newBlocks = blocks.map((b, bi) => {
      if (bi !== blockIdx) return b;
      return { ...b, groupType: type, supersetGroup: nextGroupNum } as Block;
    });
    commitBlocks(newBlocks);
  };

  // Remove a single exercise from its group into a new solo block
  const ungroupExercise = (blockIdx: number, exIdx: number) => {
    const block = blocks[blockIdx];
    const movedEx = block.exercises[exIdx];
    const remaining = block.exercises.filter((_, i) => i !== exIdx);

    const newBlocks: Block[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (i === blockIdx) {
        // Keep remaining in original block (auto-strip group if only 1 left)
        if (remaining.length > 0) {
          const keepGroup = remaining.length > 1;
          newBlocks.push({
            ...block,
            exercises: remaining,
            groupType: keepGroup ? block.groupType : null,
            supersetGroup: keepGroup ? block.supersetGroup : null,
          });
        }
        // Insert the removed exercise as solo block right after
        newBlocks.push({
          id: `block-ungrouped-${Date.now()}`,
          groupType: null,
          supersetGroup: null,
          exercises: [{ ...movedEx, superset_group: null, group_type: null }],
        });
      } else {
        newBlocks.push(blocks[i]);
      }
    }
    commitBlocks(newBlocks);
  };

  // Merge a solo block into an adjacent grouped block
  const joinAdjacentGroup = (blockIdx: number, targetBlockIdx: number) => {
    const sourceBlock = blocks[blockIdx];
    const targetBlock = blocks[targetBlockIdx];
    const mergedExercises =
      targetBlockIdx < blockIdx
        ? [...targetBlock.exercises, ...sourceBlock.exercises]
        : [...sourceBlock.exercises, ...targetBlock.exercises];

    // Keep target's group type, or default to superset
    const newBlocks = blocks
      .map((b, i) => {
        if (i === targetBlockIdx) {
          return { ...b, exercises: mergedExercises };
        }
        if (i === blockIdx) return null; // remove source
        return b;
      })
      .filter((b): b is Block => b !== null);
    commitBlocks(newBlocks);
  };

  // --- DnD handlers ---

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStr = active.id as string;
    const overStr = over.id as string;

    // Case 1: Block-level reorder (both are block IDs)
    const activeBlockIdx = blockIds.indexOf(activeStr);
    const overBlockIdx = blockIds.indexOf(overStr);
    if (activeBlockIdx !== -1 && overBlockIdx !== -1) {
      commitBlocks(arrayMove(blocks, activeBlockIdx, overBlockIdx));
      return;
    }

    // Case 2: Exercise-level reorder (same block only)
    let activeBlock = -1;
    let activeExIdx = -1;
    let overBlock = -1;
    let overExIdx = -1;

    for (const [blockId, exIds] of exerciseIds) {
      const aIdx = exIds.indexOf(activeStr);
      if (aIdx !== -1) {
        activeBlock = blocks.findIndex((b) => b.id === blockId);
        activeExIdx = aIdx;
      }
      const oIdx = exIds.indexOf(overStr);
      if (oIdx !== -1) {
        overBlock = blocks.findIndex((b) => b.id === blockId);
        overExIdx = oIdx;
      }
    }

    // Only reorder within same block; cross-block moves use the ⋯ menu
    if (activeBlock === -1 || overBlock === -1 || activeBlock !== overBlock) return;

    const block = blocks[activeBlock];
    const newExs = arrayMove(block.exercises, activeExIdx, overExIdx);
    const newBlocks = blocks.map((b, i) =>
      i === activeBlock ? { ...b, exercises: newExs } : b,
    );
    commitBlocks(newBlocks);
  };

  // Compute the global newExIdx offset for a given block
  const getGlobalOffset = (blockIdx: number): number => {
    let offset = 0;
    for (let i = 0; i < blockIdx; i++) {
      offset += blocks[i].exercises.length;
    }
    return offset;
  };

  return (
    <div
      style={{
        maxHeight: alwaysExpanded ? "85vh" : undefined,
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
          {canCollapse && (
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, display: "flex", alignItems: "center", gap: 0 }}>
          <span>{day.exercises.length} ejercicios</span>
          {muscleGroups.length > 0 && (
            <><span style={{ margin: "0 5px", opacity: 0.4 }}>•</span><span style={{ textTransform: "capitalize" }}>{muscleGroups.join(", ")}</span></>
          )}
          {estimatedMinutes > 0 && (
            <><span style={{ margin: "0 5px", opacity: 0.4 }}>•</span><span>~{estimatedMinutes} min</span></>
          )}
        </div>
      </div>

      {expanded && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            <div>
              {blocks.map((block, blockI) => {
                const isGrouped = block.groupType != null;
                const groupType = block.groupType || "superset";
                const exIds = exerciseIds.get(block.id) || [];
                const globalOffset = getGlobalOffset(blockI);

                let borderStyle: string;
                if (!isGrouped) {
                  borderStyle = "2px solid transparent";
                } else if (groupType === "superset") {
                  borderStyle = `2px solid ${groupColor}`;
                } else if (groupType === "paired") {
                  borderStyle = `2px dashed ${groupColor}`;
                } else {
                  borderStyle = `2px dotted ${groupColor}`;
                }

                return (
                  <SortableBlockItem
                    key={block.id}
                    id={block.id}
                    isGrouped={isGrouped}
                    onUngroup={() => ungroupBlock(blockI)}
                    onDeleteBlock={isGrouped ? () => deleteBlock(blockI) : undefined}
                    onAddToGroup={isGrouped ? () => {
                      const newEx: EditableExercise = {
                        exercise: "",
                        sets: 3,
                        reps: 10,
                        weight: null,
                        rpe: null,
                        superset_group: block.supersetGroup,
                        group_type: block.groupType,
                        rest_seconds: 60,
                        notes: null,
                      };
                      const newBlocks = blocks.map((b, bi) => {
                        if (bi !== blockI) return b;
                        return { ...b, exercises: [...b.exercises, newEx] };
                      });
                      const newGlobalIdx = getGlobalOffset(blockI) + block.exercises.length;
                      setNewExIdx(newGlobalIdx);
                      commitBlocks(newBlocks);
                    } : undefined}
                    groupLabel={isGrouped ? (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: groupColor,
                        letterSpacing: "0.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px 2px 6px",
                        marginLeft: RAIL_PX,
                        borderRadius: 4,
                        background: `color-mix(in srgb, ${groupColor} 10%, transparent)`,
                      }}>
                        <span style={{ fontSize: 12 }}>
                          {(GROUP_LABELS[groupType] || GROUP_LABELS.superset).icon}
                        </span>
                        {(GROUP_LABELS[groupType] || GROUP_LABELS.superset).label}
                      </span>
                    ) : undefined}
                  >
                    {(dragHeader) => (<>
                    <div
                      style={{
                        borderLeft: borderStyle,
                        borderTopLeftRadius: isGrouped ? 8 : 0,
                        borderBottomLeftRadius: isGrouped ? 8 : 0,
                        paddingLeft: RAIL_PX,
                        marginBottom: 4,
                      }}
                    >
                      {dragHeader}
                      <SortableContext items={exIds} strategy={verticalListSortingStrategy}>
                        {block.exercises.map((ex, eIdx) => {
                          // Compute adjacent group options for solo exercises
                          const adjGroups: AdjacentGroupInfo[] = [];
                          if (!isGrouped) {
                            const above = blockI > 0 ? blocks[blockI - 1] : null;
                            const below = blockI < blocks.length - 1 ? blocks[blockI + 1] : null;
                            if (above?.groupType) {
                              const label = (GROUP_LABELS[above.groupType] || GROUP_LABELS.superset).label.toLowerCase();
                              adjGroups.push({ direction: "above", label, onJoin: () => joinAdjacentGroup(blockI, blockI - 1) });
                            }
                            if (below?.groupType) {
                              const label = (GROUP_LABELS[below.groupType] || GROUP_LABELS.superset).label.toLowerCase();
                              adjGroups.push({ direction: "below", label, onJoin: () => joinAdjacentGroup(blockI, blockI + 1) });
                            }
                          }
                          return (
                          <SortableExerciseItem
                            key={exIds[eIdx]}
                            id={exIds[eIdx]}
                            ex={ex}
                            onChange={(updated) => updateExerciseInBlock(blockI, eIdx, updated)}
                            onDelete={() => deleteExerciseInBlock(blockI, eIdx)}
                            autoFocus={globalOffset + eIdx === newExIdx}
                            catalog={catalog}
                            isGrouped={isGrouped}
                            onGroup={(type) => groupExercise(blockI, type)}
                            onUngroup={() => ungroupExercise(blockI, eIdx)}
                            adjacentGroups={adjGroups}
                            activeColumns={activeColumns}
                          />
                          );
                        })}
                      </SortableContext>
                    </div>
                    {blockI < blocks.length - 1 && (
                      <div
                        style={{
                          borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                          marginLeft: RAIL_PX + 2,
                          marginBottom: 10,
                        }}
                      />
                    )}
                    </>)}
                  </SortableBlockItem>
                );
              })}
            </div>
          </SortableContext>

          {/* Add exercise / section */}
          <div style={{ paddingLeft: RAIL_PX, marginTop: 8, marginBottom: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AddLink label="+ Exercise" onClick={addExercise} />
            <AddLink label="+ Superset" icon="⚡" onClick={() => addSection("superset")} />
            <AddLink label="+ Paired" icon="🔗" onClick={() => addSection("paired")} />
            <AddLink label="+ Circuit" icon="🔄" onClick={() => addSection("circuit")} />
          </div>
        </DndContext>
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
