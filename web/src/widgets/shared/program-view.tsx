import { useState, useRef, useCallback, useEffect } from "react";
import { sp, radius, font, weight, opacity } from "../../tokens.js";

export { WeekdayPills } from "./weekday-pills.js";

export interface Exercise {
  exercise_name: string;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  target_reps_per_set: number[] | null;
  target_weight_per_set: number[] | null;
  group_id: number | null;
  group_type: "superset" | "paired" | "circuit" | null;
  group_label: string | null;
  group_notes: string | null;
  group_rest_seconds: number | null;
  section_id: number | null;
  section_label: string | null;
  section_notes: string | null;
  rest_seconds: number | null;
  notes: string | null;
  muscle_group: string | null;
  rep_type: "reps" | "seconds" | "meters" | "calories" | null;
  exercise_type?: string | null;
}

export interface Section {
  sectionId: number;
  label: string;
  notes: string | null;
  exercises: Exercise[];
}

export interface DayStructure {
  sections: Section[];
  unsectioned: Exercise[];
}

/** Group exercises into sections. Exercises without a section go into unsectioned. */
export function groupIntoSections(exercises: Exercise[]): DayStructure {
  const sections = new Map<number, Section>();
  const unsectioned: Exercise[] = [];
  const sectionOrder: number[] = [];

  for (const ex of exercises) {
    if (ex.section_id != null) {
      if (!sections.has(ex.section_id)) {
        sectionOrder.push(ex.section_id);
        sections.set(ex.section_id, {
          sectionId: ex.section_id,
          label: ex.section_label || "Section",
          notes: ex.section_notes || null,
          exercises: [],
        });
      }
      sections.get(ex.section_id)!.exercises.push(ex);
    } else {
      unsectioned.push(ex);
    }
  }

  return {
    sections: sectionOrder.map(id => sections.get(id)!),
    unsectioned,
  };
}

export const REP_UNIT: Record<string, string> = {
  reps: "r",
  seconds: "s",
  meters: "m",
  calories: "cal",
};

export interface Day {
  day_label: string;
  weekdays: number[] | null;
  exercises: Exercise[];
}

export const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // Mon-Sun
export const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Superset color palette — distinct, works in both light/dark
export const SS_COLORS = ["var(--primary)", "#10b981", "var(--warning)", "var(--danger)", "#8b5cf6", "#ec4899"];

// Consistent left padding for the content rail
export const RAIL_PX = 18;

export const GROUP_LABELS: Record<string, { icon: string; label: string; pattern: string }> = {
  superset: { icon: "⚡", label: "Superset", pattern: "2 ejercicios seguidos sin pausa, descanso al terminar la ronda" },
  paired: { icon: "🔗", label: "Paired", pattern: "El segundo se hace durante el descanso del primero, no suma tiempo" },
  circuit: { icon: "🔄", label: "Circuit", pattern: "3+ ejercicios en secuencia sin pausa, descanso al terminar la ronda" },
};

export function MuscleGroupTags({ exercises }: { exercises: Exercise[] }) {
  const groups = [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))] as string[];
  if (!groups.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: sp[2], marginTop: sp[3] }}>
      {groups.map(g => (
        <span key={g} style={{
          fontSize: font.base,
          padding: `${sp[1]}px ${sp[5]}px`,
          borderRadius: radius.lg,
          background: "var(--border)",
          color: "var(--text)",
          textTransform: "capitalize",
          fontWeight: weight.medium,
          opacity: opacity.subtle,
        }}>
          {g}
        </span>
      ))}
    </div>
  );
}

export function RpeBadge({ rpe }: { rpe: number }) {
  return (
    <span style={{
      fontSize: font.sm,
      fontWeight: weight.medium,
      color: "var(--text-secondary)",
      marginLeft: sp[2],
    }}>
      RPE {rpe}
    </span>
  );
}

/** Group exercises into blocks: grouped exercises share a block, solo exercises are individual blocks */
export function groupIntoBlocks(exercises: Exercise[]): Exercise[][] {
  const blocks: Exercise[][] = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.group_id != null) {
      const gid = ex.group_id;
      const block: Exercise[] = [];
      while (i < exercises.length && exercises[i].group_id === gid) {
        block.push(exercises[i]);
        i++;
      }
      blocks.push(block);
    } else {
      blocks.push([ex]);
      i++;
    }
  }
  return blocks;
}

export function MuscleChip({ group }: { group: string }) {
  return (
    <span style={{
      fontSize: font.xs,
      padding: `${sp[0.5]}px ${sp[4]}px`,
      borderRadius: radius.md,
      background: "var(--border)",
      color: "var(--text)",
      textTransform: "capitalize",
      fontWeight: weight.medium,
      marginLeft: sp[3],
      whiteSpace: "nowrap",
      opacity: opacity.subtle,
    }}>
      {group}
    </span>
  );
}

/** Strip redundant grouping phrases from notes (e.g. "superset con...", "Circuito con...") */
export function cleanNotes(notes: string | null, isGrouped: boolean, muscleGroup: string | null, repType?: string | null): string | null {
  if (!notes) return notes;
  let cleaned = notes;
  // Strip redundant "segundos" prefix when rep_type is already seconds (widget shows ″)
  if (repType === "seconds") {
    cleaned = cleaned.replace(/^segundos?\s*,?\s*/i, "").trim();
  }
  if (isGrouped) {
    cleaned = cleaned
      .replace(/\s*-?\s*(superset|circuito|paired|circuit)\s+(con|with)\s+\S+.*/i, "")
      .replace(/^\s*-\s*/, "")
      .trim();
  }
  if (muscleGroup && cleaned.toLowerCase() === muscleGroup.toLowerCase()) {
    return null;
  }
  return cleaned || null;
}

/** Extract rep scheme from notes (e.g. "reps: 12/10/8") — legacy, used by program-editor */
export function parseNoteReps(note: string | null): { repScheme: string | null; progression: string | null; rest: string | null } {
  if (!note) return { repScheme: null, progression: null, rest: null };
  let repScheme: string | null = null;
  let remaining = note;
  const repMatch = remaining.match(/(?:principal\s*-?\s*)?reps?:\s*([\d]+(?:\/[\d]+)+)/i);
  if (repMatch) {
    repScheme = repMatch[1];
    remaining = remaining.replace(repMatch[0], "").trim();
  }
  let progression: string | null = null;
  const progPatterns = [/con\s+progresi[oó]n.*/i, /\d+\s*a\s*\d+\s*reps?.*/i];
  for (const pat of progPatterns) {
    const match = remaining.match(pat);
    if (match) { progression = match[0].trim(); remaining = remaining.replace(match[0], "").trim(); break; }
  }
  const altMatch = remaining.match(/o\s*([\d]+(?:\/[\d]+)+)/i);
  if (altMatch && repScheme) { repScheme += ` o ${altMatch[1]}`; remaining = remaining.replace(altMatch[0], "").trim(); }
  remaining = remaining.replace(/^[\s\-·]+|[\s\-·]+$/g, "").trim();
  return { repScheme, progression, rest: remaining || null };
}

/** Format per-set reps as compact string: "12/10/8" */
function formatPerSetReps(repsPerSet: number[]): string {
  return repsPerSet.join("/");
}

/** Format per-set weight as compact range: "80→90" or "80/85/90" */
function formatPerSetWeight(weightPerSet: number[]): string {
  if (weightPerSet.length === 0) return "";
  const first = weightPerSet[0];
  const last = weightPerSet[weightPerSet.length - 1];
  // If monotonic (all ascending or descending), show range
  const allSame = weightPerSet.every(w => w === first);
  if (allSame) return String(first);
  const ascending = weightPerSet.every((w, i) => i === 0 || w >= weightPerSet[i - 1]);
  const descending = weightPerSet.every((w, i) => i === 0 || w <= weightPerSet[i - 1]);
  if (ascending || descending) return `${first}→${last}`;
  return weightPerSet.join("/");
}

function formatRestSeconds(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}′${s}″` : `${m}′`;
  }
  return `${seconds}″`;
}

/** Tap-to-reveal tooltip for notes */
function NoteTooltip({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          cursor: "pointer",
          fontSize: font.xs,
          opacity: open ? opacity.high : opacity.subtle,
          userSelect: "none",
          lineHeight: 1,
        }}
        title={text}
      >
        ⓘ
      </span>
      {open && (
        <span style={{
          position: "absolute",
          left: 0,
          top: "calc(100% + 4px)",
          background: "var(--card-bg, var(--bg))",
          border: "1px solid var(--border)",
          borderRadius: radius.md,
          padding: `${sp[2]}px ${sp[4]}px`,
          fontSize: font.xs,
          color: "var(--text-secondary)",
          fontStyle: "italic",
          whiteSpace: "nowrap",
          zIndex: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          fontWeight: weight.normal,
          textTransform: "none",
          letterSpacing: "0px",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  warmup: "Entrada en calor",
  mobility: "Movilidad",
  cardio: "Cardio",
};

function ExerciseRow({ ex, exNum, note, showExerciseRest, isSecondary, typeLabel, hasMetaLine, hasPerSet, isLast }: {
  ex: Exercise; exNum: number; note: string | null; showExerciseRest: boolean;
  isSecondary: boolean; typeLabel: string | null; hasMetaLine: boolean; hasPerSet: boolean; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const repsDisplay = ex.target_reps_per_set
    ? `(${formatPerSetReps(ex.target_reps_per_set)})`
    : String(ex.target_reps);
  const weightDisplay = ex.target_weight_per_set
    ? formatPerSetWeight(ex.target_weight_per_set)
    : ex.target_weight != null ? String(ex.target_weight) : null;

  return (
    <div style={{ marginBottom: isLast ? 0 : sp[4] }}>
      <div
        style={{
          display: "flex",
          alignItems: hasMetaLine ? "center" : "baseline",
          justifyContent: "space-between",
          gap: sp[3],
          cursor: hasPerSet ? "pointer" : "default",
        }}
        onClick={hasPerSet ? () => setExpanded(!expanded) : undefined}
      >
        {/* Left: number + name + type tag + note */}
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], minWidth: 0 }}>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.muted, minWidth: "1.2em", textAlign: "right", flexShrink: 0 }}>{exNum}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: sp[2] }}>
              <span style={{
                fontWeight: isSecondary ? weight.normal : weight.medium,
                fontSize: font.lg,
                opacity: isSecondary ? opacity.high : 1,
              }}>{ex.exercise_name}</span>
              {typeLabel && (
                <span style={{
                  fontSize: font.xs,
                  color: "var(--text-secondary)",
                  opacity: opacity.medium,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>{typeLabel}</span>
              )}
              {note && <NoteTooltip text={note} />}
              {hasPerSet && (
                <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
                  {expanded ? "▲" : "▼"}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Right: data lines stacked */}
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: sp[1], fontSize: font.md, whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{ex.target_sets}</span>
            <span style={{ opacity: opacity.muted }}>×</span>
            <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>
              {repsDisplay}
            </span>
            {ex.rep_type && REP_UNIT[ex.rep_type] && (
              <span style={{ opacity: 0.5, fontSize: font.sm }}>{REP_UNIT[ex.rep_type]}</span>
            )}
            {weightDisplay != null && (
              <>
                <span style={{ opacity: 0.35, margin: `0 ${sp[1]}px` }}>·</span>
                <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{weightDisplay}</span>
                <span style={{ opacity: 0.5, fontSize: font.sm }}>kg</span>
              </>
            )}
          </div>
          {hasMetaLine && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: sp[1], fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[0.5] }}>
              {ex.target_rpe != null && <RpeBadge rpe={ex.target_rpe} />}
              {showExerciseRest && (
                <>
                  {ex.target_rpe != null && <span style={{ opacity: 0.35, margin: `0 ${sp[1]}px` }}>·</span>}
                  <span style={{ opacity: opacity.medium }}>
                    ⏱ {formatRestSeconds(ex.rest_seconds!)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Per-set detail (expanded) */}
      {hasPerSet && expanded && (
        <div style={{
          marginTop: sp[3],
          marginLeft: "2.4em",
          padding: `${sp[3]}px ${sp[4]}px`,
          background: "color-mix(in srgb, var(--bg-secondary) 50%, transparent)",
          borderRadius: radius.md,
          border: "1px solid var(--border)",
        }}>
          {Array.from({ length: ex.target_sets }).map((_, si) => {
            const setReps = ex.target_reps_per_set ? ex.target_reps_per_set[si] : ex.target_reps;
            const setWeight = ex.target_weight_per_set ? ex.target_weight_per_set[si] : ex.target_weight;
            const repUnit = ex.rep_type && REP_UNIT[ex.rep_type] ? REP_UNIT[ex.rep_type] : "r";
            return (
              <div key={si} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: `${sp[1]}px 0`,
                fontSize: font.sm,
                color: "var(--text-secondary)",
                borderBottom: si < ex.target_sets - 1 ? "1px solid color-mix(in srgb, var(--border) 30%, transparent)" : "none",
              }}>
                <span>Serie {si + 1}</span>
                <span>
                  <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{setReps}</span>
                  <span style={{ opacity: 0.5 }}> {repUnit}</span>
                  {setWeight != null && (
                    <>
                      <span style={{ opacity: 0.35, margin: `0 ${sp[2]}px` }}>·</span>
                      <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{setWeight}</span>
                      <span style={{ opacity: 0.5 }}> kg</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExerciseBlock({ exercises, ssColor, groupType, startIndex }: { exercises: Exercise[]; ssColor: string | null; groupType: string | null; startIndex: number }) {
  const isGrouped = exercises.length > 1;
  const type = groupType || "superset";
  const groupLabel = isGrouped ? exercises[0].group_label : null;
  const groupNotes = isGrouped ? exercises[0].group_notes : null;
  const groupRestSeconds = isGrouped ? exercises[0].group_rest_seconds : null;

  let borderStyle: string;
  let labelColor: string;

  if (!isGrouped) {
    borderStyle = "2px solid transparent";
    labelColor = "var(--text-secondary)";
  } else if (type === "superset") {
    borderStyle = `2px solid ${ssColor || "var(--text-secondary)"}`;
    labelColor = ssColor || "var(--text-secondary)";
  } else if (type === "paired") {
    borderStyle = "2px dashed var(--border)";
    labelColor = "var(--text-secondary)";
  } else {
    borderStyle = `4px double ${ssColor || "var(--border)"}`;
    labelColor = ssColor || "var(--text-secondary)";
  }

  return (
    <div style={{
      borderLeft: borderStyle,
      borderBottomLeftRadius: isGrouped ? radius.md : 0,
      paddingLeft: RAIL_PX,
      marginBottom: sp[2],
    }}>
      {/* Header: type chip + label + tooltip */}
      {isGrouped && (
        <div style={{
          marginBottom: sp[3],
          display: "flex",
          alignItems: "center",
          gap: sp[3],
        }}>
          <span style={{
            fontSize: font.xs,
            fontWeight: weight.semibold,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            padding: `${sp[1]}px ${sp[3]}px`,
            borderRadius: radius.lg,
            background: labelColor,
            color: "var(--card-bg, var(--bg))",
            whiteSpace: "nowrap",
          }}>
            {(GROUP_LABELS[type] || GROUP_LABELS.superset).label}
          </span>
          {groupLabel && (
            <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium }}>
              {groupLabel}
            </span>
          )}
          <NoteTooltip text={(GROUP_LABELS[type] || GROUP_LABELS.superset).pattern} />
        </div>
      )}
      {/* Exercises */}
      {exercises.map((ex, i) => {
        const note = cleanNotes(ex.notes, isGrouped, ex.muscle_group, ex.rep_type);
        const showExerciseRest = !isGrouped && ex.rest_seconds != null;
        const isSecondary = (ex as any).exercise_type === "warmup" || (ex as any).exercise_type === "mobility" || (ex as any).exercise_type === "cardio";
        const typeLabel = EXERCISE_TYPE_LABELS[(ex as any).exercise_type || ""] || null;
        const hasMetaLine = ex.target_rpe != null || showExerciseRest;
        const exNum = startIndex + i;
        const hasPerSet = ex.target_reps_per_set != null || ex.target_weight_per_set != null;
        return (
          <ExerciseRow
            key={i}
            ex={ex}
            exNum={exNum}
            note={note}
            showExerciseRest={showExerciseRest}
            isSecondary={isSecondary}
            typeLabel={typeLabel}
            hasMetaLine={hasMetaLine}
            hasPerSet={hasPerSet}
            isLast={i >= exercises.length - 1}
          />
        );
      })}
      {/* Footer: group rest + notes */}
      {isGrouped && (groupRestSeconds != null || groupNotes) && (
        <div style={{ marginTop: sp[3], fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: sp[3] }}>
          {groupRestSeconds != null && (
            <span>⏱ {formatRestSeconds(groupRestSeconds)}</span>
          )}
          {groupNotes && <NoteTooltip text={groupNotes} />}
        </div>
      )}
    </div>
  );
}

/** Render a list of exercise blocks with consistent numbering */
function ExerciseBlockList({ blocks, ssGroupColors, startNumber }: {
  blocks: Exercise[][];
  ssGroupColors: Map<number, string>;
  startNumber: number;
}) {
  let currentIdx = startNumber;
  return (
    <>
      {blocks.map((block, i) => {
        const gid = block[0].group_id;
        const color = gid != null ? ssGroupColors.get(gid) || null : null;
        const groupType = block[0].group_type;
        const startIdx = currentIdx;
        currentIdx += block.length;
        return (
          <div key={i}>
            <ExerciseBlock exercises={block} ssColor={color} groupType={groupType} startIndex={startIdx} />
            {i < blocks.length - 1 && (
              <div style={{
                borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                marginLeft: RAIL_PX + 2,
                marginBottom: sp[5],
              }} />
            )}
          </div>
        );
      })}
    </>
  );
}

export function SectionCard({ section, ssGroupColors, startNumber }: {
  section: Section;
  ssGroupColors: Map<number, string>;
  startNumber: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const blocks = groupIntoBlocks(section.exercises);

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: radius.lg,
      padding: `${sp[4]}px ${sp[5]}px`,
      marginBottom: sp[4],
      background: "color-mix(in srgb, var(--bg-secondary) 50%, transparent)",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: expanded ? sp[4] : 0,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {expanded ? "▼" : "▶"}
          </span>
          <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
            {section.label}
          </span>
          {section.notes && (
            <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium, fontStyle: "italic" }}>
              {section.notes}
            </span>
          )}
        </div>
        <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
          {section.exercises.length} ej.
        </span>
      </div>
      {expanded && (
        <ExerciseBlockList blocks={blocks} ssGroupColors={ssGroupColors} startNumber={startNumber} />
      )}
    </div>
  );
}

export function DayCard({ day, alwaysExpanded }: { day: Day; alwaysExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const canCollapse = !alwaysExpanded;

  const blocks = groupIntoBlocks(day.exercises);

  const ssGroupColors = new Map<number, string>();
  let colorIdx = 0;
  day.exercises.forEach(ex => {
    if (ex.group_id != null && !ssGroupColors.has(ex.group_id)) {
      ssGroupColors.set(ex.group_id, SS_COLORS[colorIdx % SS_COLORS.length]);
      colorIdx++;
    }
  });

  const weekdayNames = day.weekdays?.map(w => WEEKDAY_NAMES[w - 1]).filter(Boolean);
  const titleLabel = weekdayNames?.length
    ? `${day.day_label} - ${weekdayNames.join(", ")}`
    : day.day_label;

  const estimatedMinutes = Math.round(
    day.exercises.reduce((total, ex) => {
      const workPerSet = 40;
      const rest = ex.rest_seconds || 60;
      const sets = ex.target_sets || 3;
      return total + sets * workPerSet + (sets - 1) * rest;
    }, 0) / 60
  );

  const muscleGroups = [...new Set(day.exercises.map(e => e.muscle_group).filter(Boolean))] as string[];

  return (
    <div>
      <div
        style={{
          cursor: canCollapse ? "pointer" : "default",
          paddingLeft: RAIL_PX + 2,
          marginBottom: sp[5],
        }}
        onClick={canCollapse ? () => setExpanded(!expanded) : undefined}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: weight.semibold, fontSize: font.xl }}>{titleLabel}</div>
          {canCollapse && (
            <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>{expanded ? "▲" : "▼"}</span>
          )}
        </div>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", marginTop: sp[1], display: "flex", alignItems: "center", gap: 0 }}>
          <span>{day.exercises.length} ejercicios</span>
          {estimatedMinutes > 0 && (
            <><span style={{ margin: `0 ${sp[3]}px`, opacity: opacity.muted }}>·</span><span>~{estimatedMinutes} min</span></>
          )}
        </div>
        {muscleGroups.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: sp[2], marginTop: sp[3] }}>
            {muscleGroups.map(g => (
              <span key={g} style={{
                fontSize: font.xs,
                padding: `${sp[0.5]}px ${sp[3]}px`,
                borderRadius: radius.lg,
                background: "var(--border)",
                color: "var(--text-secondary)",
                textTransform: "capitalize",
              }}>{g}</span>
            ))}
          </div>
        )}
      </div>
      {/* Divider between header and exercises */}
      {expanded && (
        <div style={{
          borderBottom: "1px solid var(--border)",
          marginLeft: RAIL_PX + 2,
          marginBottom: sp[5],
          opacity: 0.5,
        }} />
      )}

      {expanded && (() => {
        const { sections, unsectioned } = groupIntoSections(day.exercises);
        const hasSections = sections.length > 0;

        if (!hasSections) {
          // No sections — render blocks directly (original behavior)
          return (
            <div>
              <ExerciseBlockList blocks={blocks} ssGroupColors={ssGroupColors} startNumber={1} />
            </div>
          );
        }

        // Render with sections: maintain global numbering across sections and unsectioned exercises
        let globalNum = 1;

        // Build render order: interleave sections and unsectioned exercises by sort_order
        // Unsectioned exercises come before/after/between sections based on their sort_order
        const allItems: Array<{ type: "section"; section: Section } | { type: "unsectioned"; exercises: Exercise[] }> = [];

        // Find the min sort_order of each section
        const sectionStarts = sections.map(s => ({
          section: s,
          sortOrder: Math.min(...s.exercises.map(e => (e as any).sort_order ?? 0)),
        }));

        // Group unsectioned exercises by consecutive runs
        if (unsectioned.length > 0) {
          allItems.push({ type: "unsectioned", exercises: unsectioned });
        }

        // Build final ordered list
        const orderedItems: typeof allItems = [];
        let unsectionedIdx = 0;
        const unsectionedByOrder = unsectioned.map(e => ({
          exercise: e,
          sortOrder: (e as any).sort_order ?? 0,
        })).sort((a, b) => a.sortOrder - b.sortOrder);

        let sIdx = 0;
        let uIdx = 0;

        while (sIdx < sectionStarts.length || uIdx < unsectionedByOrder.length) {
          const sOrder = sIdx < sectionStarts.length ? sectionStarts[sIdx].sortOrder : Infinity;
          const uOrder = uIdx < unsectionedByOrder.length ? unsectionedByOrder[uIdx].sortOrder : Infinity;

          if (sOrder <= uOrder && sIdx < sectionStarts.length) {
            orderedItems.push({ type: "section", section: sectionStarts[sIdx].section });
            sIdx++;
          } else if (uIdx < unsectionedByOrder.length) {
            // Collect consecutive unsectioned exercises
            const batch: Exercise[] = [unsectionedByOrder[uIdx].exercise];
            uIdx++;
            while (uIdx < unsectionedByOrder.length &&
                   (sIdx >= sectionStarts.length || unsectionedByOrder[uIdx].sortOrder < sectionStarts[sIdx].sortOrder)) {
              batch.push(unsectionedByOrder[uIdx].exercise);
              uIdx++;
            }
            orderedItems.push({ type: "unsectioned", exercises: batch });
          }
        }

        return (
          <div>
            {orderedItems.map((item, i) => {
              if (item.type === "section") {
                const startNum = globalNum;
                globalNum += item.section.exercises.length;
                return (
                  <SectionCard
                    key={`section-${item.section.sectionId}`}
                    section={item.section}
                    ssGroupColors={ssGroupColors}
                    startNumber={startNum}
                  />
                );
              } else {
                const unsectionedBlocks = groupIntoBlocks(item.exercises);
                const startNum = globalNum;
                globalNum += item.exercises.length;
                return (
                  <div key={`unsectioned-${i}`}>
                    <ExerciseBlockList blocks={unsectionedBlocks} ssGroupColors={ssGroupColors} startNumber={startNum} />
                    {i < orderedItems.length - 1 && (
                      <div style={{
                        borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                        marginLeft: RAIL_PX + 2,
                        marginBottom: sp[5],
                      }} />
                    )}
                  </div>
                );
              }
            })}
          </div>
        );
      })()}
    </div>
  );
}

export function DayCarousel({ days, activeIdx, goTo }: { days: Day[]; activeIdx: number; goTo: (idx: number) => void }) {
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      goTo(activeIdx + (dx < 0 ? 1 : -1));
    }
  }, [activeIdx, goTo]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <DayCard day={days[activeIdx]} alwaysExpanded />
    </div>
  );
}
