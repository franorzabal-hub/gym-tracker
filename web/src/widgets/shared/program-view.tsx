import { useState, useRef, useCallback, useEffect } from "react";
import { sp, radius, font, weight, opacity } from "../../tokens.js";
import { useI18n } from "../../i18n/index.js";
import {
  REP_UNIT,
  GROUP_LABELS,
  useGroupLabels,
  GroupIcon,
  formatRestSeconds,
  formatPerSetReps,
  formatPerSetWeight,
  formatRepsRange,
} from "./exercise-utils.js";

import { WeekdayPills } from "./weekday-pills.js";
export { WeekdayPills };

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

// Re-export for backwards compatibility
export { REP_UNIT } from "./exercise-utils.js";

export interface Day {
  day_label: string;
  weekdays: number[] | null;
  exercises: Exercise[];
}

/** Use useWeekdayLabels hook for localized labels */
export const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // Mon-Sun (deprecated, use hook)
export const WEEKDAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; // deprecated

/** Hook to get localized weekday labels */
export function useWeekdayLabels(): { short: string[]; long: string[] } {
  const { t } = useI18n();
  return {
    short: t("weekdays.short") as unknown as string[],
    long: t("weekdays.long") as unknown as string[],
  };
}

// Superset color palette — distinct, works in both light/dark
export const SS_COLORS = ["var(--primary)", "#10b981", "var(--warning)", "var(--danger)", "#8b5cf6", "#ec4899"];

// Consistent left padding for the content rail
export const RAIL_PX = 18;

// GROUP_LABELS now imported from exercise-utils.js

// GroupIcon now imported from exercise-utils.js

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

// formatPerSetReps, formatPerSetWeight, formatRestSeconds now imported from exercise-utils.js

/** Tap-to-reveal tooltip for notes */
function NoteTooltip({ text, defaultOpen = false }: { text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top?: string; bottom?: string; left?: string; right?: string }>({ left: "0", top: "calc(100% + 4px)" });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [open]);

  useEffect(() => {
    if (!open || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next: typeof pos = {};

    // Horizontal: if overflows right, anchor to right instead
    if (rect.right > vw - 8) {
      next.right = "0";
    } else {
      next.left = "0";
    }

    // Vertical: if overflows bottom, show above
    if (rect.bottom > vh - 8) {
      next.bottom = "calc(100% + 4px)";
    } else {
      next.top = "calc(100% + 4px)";
    }

    setPos(next);
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
        <span ref={tooltipRef} style={{
          position: "absolute",
          ...pos,
          background: "var(--card-bg, var(--bg))",
          border: "1px solid var(--border)",
          borderRadius: radius.md,
          padding: `${sp[2]}px ${sp[4]}px`,
          fontSize: font.xs,
          color: "var(--text-secondary)",
          fontStyle: "italic",
          whiteSpace: "normal",
          maxWidth: "min(280px, 90vw)",
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

function ExerciseRow({ ex, exNum, showExerciseRest, isSecondary, hasRpeLine, hasPerSet, isLast }: {
  ex: Exercise; exNum: number; showExerciseRest: boolean;
  isSecondary: boolean; hasRpeLine: boolean; hasPerSet: boolean; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const repsDisplay = ex.target_reps_per_set
    ? formatRepsRange(ex.target_reps_per_set)
    : String(ex.target_reps);
  const weightDisplay = ex.target_weight_per_set
    ? formatPerSetWeight(ex.target_weight_per_set)
    : ex.target_weight != null ? String(ex.target_weight) : null;

  return (
    <div style={{ marginBottom: isLast ? 0 : sp[4] }}>
      <div
        className={hasPerSet ? "tappable exercise-row" : "exercise-row"}
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: sp[3],
          cursor: hasPerSet ? "pointer" : "default",
        }}
        onClick={hasPerSet ? () => setExpanded(!expanded) : undefined}
      >
        {/* Left: number + name + type tag */}
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], minWidth: 0 }}>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.muted, minWidth: "1.2em", textAlign: "right", flexShrink: 0 }}>{exNum}</span>
          <span className="exercise-name" style={{
            fontWeight: isSecondary ? weight.normal : weight.medium,
            fontSize: font.lg,
            opacity: isSecondary ? opacity.high : 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>{ex.exercise_name}</span>
        </div>
        {/* Right: sets × reps · weight · rest (inline) */}
        <div className="exercise-metrics" style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: sp[1], fontSize: font.md, whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{ex.target_sets}</span>
          <span style={{ opacity: opacity.muted }}>×</span>
          <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>
            {repsDisplay}
          </span>
          {ex.rep_type && REP_UNIT[ex.rep_type] && (
            <span style={{ opacity: opacity.muted, fontSize: font.sm }}>{REP_UNIT[ex.rep_type]}</span>
          )}
          {weightDisplay != null && (
            <>
              <span style={{ opacity: opacity.muted, margin: `0 ${sp[1]}px` }}>·</span>
              <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{weightDisplay}</span>
              <span style={{ opacity: opacity.muted, fontSize: font.sm }}>kg</span>
            </>
          )}
          {showExerciseRest && (
            <>
              <span style={{ opacity: opacity.muted, margin: `0 ${sp[1]}px` }}>·</span>
              <span style={{ opacity: opacity.medium, fontSize: font.sm }}>⏱ {formatRestSeconds(ex.rest_seconds!)}</span>
            </>
          )}
        </div>
      </div>
      {/* Meta line: RPE only (below, right-aligned) */}
      {hasRpeLine && (
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: sp[2],
          marginTop: sp[1],
        }}>
          {ex.target_rpe != null && <RpeBadge rpe={ex.target_rpe} />}
        </div>
      )}
      {/* Per-set detail (expanded on row click) - compact style matching workout */}
      {hasPerSet && expanded && (
        <div className="per-set-detail">
          {Array.from({ length: ex.target_sets }).map((_, si) => {
            const setReps = ex.target_reps_per_set ? ex.target_reps_per_set[si] : ex.target_reps;
            const setWeight = ex.target_weight_per_set ? ex.target_weight_per_set[si] : ex.target_weight;
            return (
              <div key={si} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: `${sp[1]}px 0`,
                fontSize: font.sm,
                color: "var(--text-secondary)",
                borderBottom: si < ex.target_sets - 1 ? "1px solid color-mix(in srgb, var(--border) 30%, transparent)" : "none",
              }}>
                <span style={{ minWidth: "3.5em" }}>Set {si + 1}</span>
                <span>
                  <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{setReps}</span>
                  {setWeight != null && (
                    <>
                      <span style={{ opacity: opacity.muted, margin: `0 ${sp[1]}px` }}>×</span>
                      <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{setWeight}</span>
                      <span style={{ opacity: opacity.muted }}> kg</span>
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

export function ExerciseBlock({ exercises, ssColor, groupType, startIndex, collapsible = true }: { exercises: Exercise[]; ssColor: string | null; groupType: string | null; startIndex: number; collapsible?: boolean }) {
  const { t } = useI18n();
  const GROUP_LABELS_LOCALIZED = useGroupLabels();
  const isGrouped = exercises.length > 1;
  const [expanded, setExpanded] = useState(true);
  const type = groupType || "superset";
  const groupLabel = isGrouped ? exercises[0].group_label : null;
  const groupNotes = isGrouped ? exercises[0].group_notes : null;
  const groupRestSeconds = isGrouped ? exercises[0].group_rest_seconds : null;

  // Solo exercises are never collapsible
  if (!isGrouped) {
    return (
      <div style={{ marginBottom: sp[2] }}>
        {exercises.map((ex, i) => {
          const showExerciseRest = ex.rest_seconds != null;
          const isSecondary = (ex as any).exercise_type === "warmup" || (ex as any).exercise_type === "mobility" || (ex as any).exercise_type === "cardio";
          const hasRpeLine = ex.target_rpe != null;
          const hasPerSet = ex.target_reps_per_set != null || ex.target_weight_per_set != null;
          return (
            <ExerciseRow key={i} ex={ex} exNum={startIndex + i} showExerciseRest={showExerciseRest}
              isSecondary={isSecondary} hasRpeLine={hasRpeLine} hasPerSet={hasPerSet} isLast={i >= exercises.length - 1} />
          );
        })}
      </div>
    );
  }

  const headerLabel = groupLabel || GROUP_LABELS_LOCALIZED[type] || GROUP_LABELS_LOCALIZED.superset;
  const canCollapse = collapsible;
  const showExercises = canCollapse ? expanded : true;

  return (
    <div style={{ marginBottom: sp[2] }}>
      {/* Header */}
      <div
        className={canCollapse ? "tappable section-header" : undefined}
        onClick={canCollapse ? () => setExpanded(!expanded) : undefined}
        style={{
          cursor: canCollapse ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: showExercises ? sp[3] : 0,
          userSelect: "none",
        }}
        role={canCollapse ? "button" : undefined}
        aria-expanded={canCollapse ? expanded : undefined}
        tabIndex={canCollapse ? 0 : undefined}
        onKeyDown={canCollapse ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } } : undefined}
      >
        <div style={{ display: "flex", alignItems: "center", gap: sp[2] }}>
          {canCollapse && (
            <span aria-hidden="true" style={{ fontSize: font.sm, color: "var(--text-secondary)", transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
              ▼
            </span>
          )}
          <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
            {headerLabel}
          </span>
          <span style={{ color: "var(--text-secondary)", opacity: opacity.subtle, display: "inline-flex" }} aria-hidden="true">
            <GroupIcon type={type} size={font.md} />
          </span>
        </div>
        {canCollapse && (
          <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {t("groups.exerciseCount", { count: exercises.length })}
          </span>
        )}
      </div>
      {/* Exercises — indented under the group header */}
      {showExercises && (
        <div style={{ paddingLeft: sp[3] }}>
          {exercises.map((ex, i) => {
            const isSecondary = (ex as any).exercise_type === "warmup" || (ex as any).exercise_type === "mobility" || (ex as any).exercise_type === "cardio";
            const hasRpeLine = ex.target_rpe != null;
            const hasPerSet = ex.target_reps_per_set != null || ex.target_weight_per_set != null;
            return (
              <ExerciseRow
                key={i}
                ex={ex}
                exNum={startIndex + i}
                showExerciseRest={false}
                isSecondary={isSecondary}
                hasRpeLine={hasRpeLine}
                hasPerSet={hasPerSet}
                isLast={i >= exercises.length - 1}
              />
            );
          })}
          {/* Footer: group rest + notes */}
          {(groupRestSeconds != null || groupNotes) && (
            <div style={{ marginTop: sp[3], display: "flex", alignItems: "center", justifyContent: "flex-end", gap: sp[3] }}>
              {groupRestSeconds != null && (
                <span className="rest-badge">⏱ {formatRestSeconds(groupRestSeconds)}</span>
              )}
              {groupNotes && <NoteTooltip text={groupNotes} />}
            </div>
          )}
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
        const hasSiblings = blocks.length > 1;
        return (
          <div key={i}>
            <ExerciseBlock exercises={block} ssColor={color} groupType={groupType} startIndex={startIdx} collapsible={hasSiblings} />
            {i < blocks.length - 1 && (
              <div style={{
                borderBottom: "1px solid color-mix(in srgb, var(--border) 30%, transparent)",
                marginBottom: sp[4],
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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const blocks = groupIntoBlocks(section.exercises);

  return (
    <section style={{ marginBottom: sp[5] }} aria-label={section.label}>
      <div
        className="tappable section-header"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        style={{
          marginBottom: expanded ? sp[3] : 0,
          userSelect: "none",
        }}
      >
        {/* Line 1: chevron + label + count */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <span aria-hidden="true" style={{ fontSize: font.sm, color: "var(--text-secondary)", transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
              ▼
            </span>
            <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
              {section.label}
            </span>
          </div>
          <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {t("groups.exerciseCount", { count: section.exercises.length })}
          </span>
        </div>
        {/* Line 2: notes (if any) */}
        {section.notes && (
          <div style={{
            fontSize: font.xs,
            color: "var(--text-secondary)",
            opacity: opacity.medium,
            fontStyle: "italic",
            marginTop: sp[1],
            paddingLeft: `calc(${font.sm}px + ${sp[3]}px)`,
          }}>
            {section.notes}
          </div>
        )}
      </div>
      {expanded && (
        <div style={{ paddingLeft: sp[3] }}>
          <ExerciseBlockList blocks={blocks} ssGroupColors={ssGroupColors} startNumber={startNumber} />
        </div>
      )}
    </section>
  );
}

export function DayCard({ day, alwaysExpanded }: { day: Day; alwaysExpanded?: boolean }) {
  const { t } = useI18n();
  const { long: weekdayNamesLocalized } = useWeekdayLabels();
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

  const weekdayNames = day.weekdays?.map(w => weekdayNamesLocalized[w - 1]).filter(Boolean);
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
          marginBottom: sp[4],
        }}
        onClick={canCollapse ? () => setExpanded(!expanded) : undefined}
        onKeyDown={canCollapse ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } } : undefined}
        role={canCollapse ? "button" : undefined}
        aria-expanded={canCollapse ? expanded : undefined}
        tabIndex={canCollapse ? 0 : undefined}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontWeight: weight.semibold, fontSize: font.xl, margin: 0 }}>{titleLabel}</h2>
          {canCollapse && (
            <span aria-hidden="true" style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>{expanded ? "▲" : "▼"}</span>
          )}
        </div>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", marginTop: sp[1], display: "flex", alignItems: "center", gap: 0 }}>
          <span>{t("programView.exercises", { count: day.exercises.length })}</span>
          {estimatedMinutes > 0 && (
            <><span aria-hidden="true" style={{ margin: `0 ${sp[3]}px`, opacity: opacity.muted }}>·</span><span>{t("programView.estimatedTime", { minutes: estimatedMinutes })}</span></>
          )}
        </div>
        {muscleGroups.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: sp[2], marginTop: sp[3] }} role="list" aria-label="Muscle groups">
            {muscleGroups.map(g => (
              <span key={g} role="listitem" style={{
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
          borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
          marginBottom: sp[4],
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
                        borderBottom: "1px solid color-mix(in srgb, var(--border) 30%, transparent)",
                        marginBottom: sp[4],
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

/** Program navigation tabs with accessibility and keyboard support */
export function ProgramTabs({ programs, activeIdx, goTo }: { programs: Program[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = programs.length;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        goTo((activeIdx + 1) % len);
        break;
      case "ArrowLeft":
        e.preventDefault();
        goTo((activeIdx - 1 + len) % len);
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(len - 1);
        break;
    }
  }, [programs.length, activeIdx, goTo]);

  if (programs.length <= 1) return null;

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Programs"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
        scrollbarWidth: "none",
        gap: sp[1],
        marginBottom: sp[6],
      }}
    >
      {programs.map((program, i) => {
        const isActive = i === activeIdx;

        return (
          <button
            key={program.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`program-panel-${i}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => goTo(i)}
            className="day-tab"
            style={{
              fontSize: font.sm,
              fontWeight: isActive ? weight.semibold : weight.medium,
              marginBottom: "-1px",
              background: "transparent",
              border: "none",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: isActive ? "var(--primary)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={program.name}
          >
            {program.name}
          </button>
        );
      })}
    </div>
  );
}

/** Day navigation tabs with accessibility and keyboard support */
export function DayTabs({ days, activeIdx, goTo }: { days: Day[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = days.length;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        goTo((activeIdx + 1) % len);
        break;
      case "ArrowLeft":
        e.preventDefault();
        goTo((activeIdx - 1 + len) % len);
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(len - 1);
        break;
    }
  }, [days.length, activeIdx, goTo]);

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Program days"
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
        scrollbarWidth: "none",
        gap: sp[1],
      }}
    >
      {days.map((day, i) => {
        const isActive = i === activeIdx;
        const shortLabel = day.day_label.split(/\s*[—–-]\s*/)[0] || `Day ${i + 1}`;

        return (
          <button
            key={i}
            role="tab"
            aria-selected={isActive}
            aria-controls={`day-panel-${i}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => goTo(i)}
            className="day-tab"
            style={{
              fontSize: font.sm,
              fontWeight: isActive ? weight.semibold : weight.medium,
              marginBottom: "-1px",
              background: "transparent",
              border: "none",
              borderBottomWidth: "2px",
              borderBottomStyle: "solid",
              borderBottomColor: isActive ? "var(--primary)" : "transparent",
              color: isActive ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}

// ── ProgramView: shared component for displaying a program ──

export interface Program {
  id: number;
  name: string;
  description: string | null;
  version: number;
  days: Day[];
  is_active?: boolean;
  is_validated?: boolean;
}

export interface ProgramViewProps {
  program: Program;
  /** Current viewing day index */
  viewingIdx: number;
  /** Callback when user navigates to a different day */
  onDayChange: (idx: number) => void;
  /** Use h1 for title (default: h2) */
  isMainHeading?: boolean;
  /** Custom title render (for diff display) */
  renderTitle?: (name: string) => React.ReactNode;
  /** Custom description render (for diff display) */
  renderDescription?: (description: string | null) => React.ReactNode;
  /** Hide the Active/Inactive badge */
  hideBadge?: boolean;
  /** Custom badge to show instead of Active/Inactive */
  badge?: React.ReactNode;
}

export function ProgramView({
  program,
  viewingIdx,
  onDayChange,
  isMainHeading = false,
  renderTitle,
  renderDescription,
  hideBadge = false,
  badge,
}: ProgramViewProps) {
  const { t } = useI18n();
  const totalExercises = program.days.reduce((sum, d) => sum + d.exercises.length, 0);
  const active = program.is_active ?? false;

  const TitleTag = isMainHeading ? "h1" : "h2";

  // Determine which badge to show
  const badgeElement = badge !== undefined ? badge : !hideBadge ? (
    active
      ? <span className="badge badge-success">{t("programs.active")}</span>
      : <span className="badge badge-muted">{t("programs.inactive")}</span>
  ) : null;

  return (
    <article aria-label={`${t("programs.title")}: ${program.name}`}>
      {/* Header */}
      <header style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[1] }}>
          <TitleTag className="title" style={{ marginBottom: 0 }}>
            {renderTitle ? renderTitle(program.name) : program.name}
          </TitleTag>
          {badgeElement}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], flexWrap: "wrap" }}>
          {renderDescription ? (
            renderDescription(program.description)
          ) : program.description ? (
            <span style={{ fontSize: font.base, color: "var(--text-secondary)" }}>{program.description}</span>
          ) : null}
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {t("programs.daysPerWeek", { count: program.days.length })} · {t("programs.exercisesCount", { count: totalExercises })}
          </span>
        </div>
        {/* Day navigation tabs (only if multiple days) */}
        {program.days.length > 1 && (
          <nav style={{ marginTop: sp[4] }} aria-label="Program days navigation">
            <DayTabs days={program.days} activeIdx={viewingIdx} goTo={onDayChange} />
          </nav>
        )}
      </header>

      {/* Day content panel */}
      <section
        role="tabpanel"
        id={`day-panel-${viewingIdx}`}
        aria-labelledby={`day-tab-${viewingIdx}`}
        aria-label="Day exercises"
      >
        {program.days.length === 1
          ? <DayCard day={program.days[0]} alwaysExpanded />
          : <DayCarousel days={program.days} activeIdx={viewingIdx} goTo={onDayChange} />
        }
      </section>
    </article>
  );
}
