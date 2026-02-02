import { useState, useRef, useCallback } from "react";
import { sp, radius, font, weight, opacity } from "../../tokens.js";

export { WeekdayPills } from "./weekday-pills.js";

export interface Exercise {
  exercise_name: string;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  group_id: number | null;
  group_type: "superset" | "paired" | "circuit" | null;
  group_label: string | null;
  group_notes: string | null;
  group_rest_seconds: number | null;
  rest_seconds: number | null;
  notes: string | null;
  muscle_group: string | null;
  rep_type: "reps" | "seconds" | "meters" | "calories" | null;
}

export const REP_UNIT: Record<string, string> = {
  seconds: "″",
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

export const GROUP_LABELS: Record<string, { icon: string; label: string }> = {
  superset: { icon: "⚡", label: "Superset" },
  paired: { icon: "🔗", label: "Paired" },
  circuit: { icon: "🔄", label: "Circuit" },
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
  const color = rpe >= 9 ? "var(--danger)" : rpe >= 8 ? "var(--warning)" : "var(--success)";
  return (
    <span style={{
      fontSize: font.sm,
      fontWeight: weight.semibold,
      color,
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
export function cleanNotes(notes: string | null, isGrouped: boolean, muscleGroup: string | null): string | null {
  if (!notes || !isGrouped) return notes;
  let cleaned = notes
    .replace(/\s*-?\s*(superset|circuito|paired|circuit)\s+(con|with)\s+\S+.*/i, "")
    .replace(/^\s*-\s*/, "")
    .trim();
  if (muscleGroup && cleaned.toLowerCase() === muscleGroup.toLowerCase()) {
    return null;
  }
  return cleaned || null;
}

/** Extract rep scheme from notes (e.g. "reps: 12/10/8") and remaining text */
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
  const progPatterns = [
    /con\s+progresi[oó]n.*/i,
    /\d+\s*a\s*\d+\s*reps?.*/i,
  ];
  for (const pat of progPatterns) {
    const match = remaining.match(pat);
    if (match) {
      progression = match[0].trim();
      remaining = remaining.replace(match[0], "").trim();
      break;
    }
  }

  const altMatch = remaining.match(/o\s*([\d]+(?:\/[\d]+)+)/i);
  if (altMatch && repScheme) {
    repScheme += ` o ${altMatch[1]}`;
    remaining = remaining.replace(altMatch[0], "").trim();
  }

  remaining = remaining.replace(/^[\s\-·]+|[\s\-·]+$/g, "").trim();

  return {
    repScheme,
    progression,
    rest: remaining || null,
  };
}

function formatRestSeconds(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}′${s}″` : `${m}′`;
  }
  return `${seconds}″`;
}

export function ExerciseBlock({ exercises, ssColor, groupType }: { exercises: Exercise[]; ssColor: string | null; groupType: string | null }) {
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
    borderStyle = `2px dotted ${ssColor || "var(--border)"}`;
    labelColor = ssColor || "var(--text-secondary)";
  }

  return (
    <div style={{
      borderLeft: borderStyle,
      borderBottomLeftRadius: isGrouped ? radius.md : 0,
      paddingLeft: RAIL_PX,
      marginBottom: sp[2],
    }}>
      {/* Header: icon + type + label */}
      {isGrouped && (
        <div style={{
          fontSize: font.xs,
          fontWeight: weight.semibold,
          textTransform: "uppercase",
          color: labelColor,
          marginBottom: sp[2],
          letterSpacing: "0.5px",
          opacity: opacity.high,
          display: "flex",
          alignItems: "center",
          gap: sp[1.5],
        }}>
          <span style={{ fontSize: font.base }}>{(GROUP_LABELS[type] || GROUP_LABELS.superset).icon}</span>
          {(GROUP_LABELS[type] || GROUP_LABELS.superset).label}
          {groupLabel && (
            <span style={{ textTransform: "none", fontWeight: weight.medium, opacity: opacity.medium, letterSpacing: "0px" }}>
              — {groupLabel}
            </span>
          )}
        </div>
      )}
      {/* Exercises */}
      {exercises.map((ex, i) => {
        const note = cleanNotes(ex.notes, isGrouped, ex.muscle_group);
        const { repScheme, progression, rest: noteText } = parseNoteReps(note);
        // Solo exercise shows its own rest_seconds; grouped exercises don't (rest is on the group footer)
        const showExerciseRest = !isGrouped && ex.rest_seconds != null;
        return (
          <div key={i} style={{
            marginBottom: i < exercises.length - 1 ? sp[4] : 0,
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: `0 ${sp[4]}px` }}>
              <div style={{ fontWeight: weight.medium, fontSize: font.lg }}>
                {ex.exercise_name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: sp[1], fontSize: font.md, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{ex.target_sets}</span>
                <span style={{ opacity: opacity.muted }}>×</span>
                <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>
                  {repScheme ? `(${repScheme})` : ex.target_reps}
                </span>
                {ex.rep_type && REP_UNIT[ex.rep_type] && (
                  <span style={{ opacity: 0.5, fontSize: font.sm }}>{REP_UNIT[ex.rep_type]}</span>
                )}
                {ex.target_weight != null && (
                  <>
                    <span style={{ opacity: 0.35, margin: `0 ${sp[1]}px` }}>·</span>
                    <span style={{ fontWeight: weight.bold, color: "var(--text)" }}>{ex.target_weight}</span>
                    <span style={{ opacity: 0.5, fontSize: font.sm }}>kg</span>
                  </>
                )}
                {ex.target_rpe != null && <><span style={{ opacity: 0.35, margin: `0 ${sp[1]}px` }}>·</span><RpeBadge rpe={ex.target_rpe} /></>}
                {showExerciseRest && (
                  <>
                    <span style={{ opacity: 0.25, margin: `0 ${sp[1.5]}px` }}>|</span>
                    <span style={{ opacity: opacity.medium, fontSize: font.sm }}>
                      ⏱ {formatRestSeconds(ex.rest_seconds!)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {progression && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: sp[1.5],
                fontSize: font.sm,
                color: "var(--color-progression)",
                fontWeight: weight.medium,
                marginTop: sp[1.5],
                padding: `${sp[0.5]}px ${sp[4]}px`,
                borderRadius: radius.lg,
                background: "var(--color-progression-bg)",
              }}>
                📈 {progression}
              </span>
            )}
            {noteText && (() => {
              const durationMatch = noteText.match(/^(\d+)\s*seg/i);
              if (durationMatch) {
                const noteSecs = parseInt(durationMatch[1], 10);
                if (noteSecs === ex.target_reps || noteSecs === ex.rest_seconds) return null;
              }
              return (
                <div style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[0.5], opacity: opacity.subtle }}>
                  {/^\d+\s*seg/i.test(noteText) ? `⏳ ${noteText}` : noteText}
                </div>
              );
            })()}
          </div>
        );
      })}
      {/* Footer: group rest + notes */}
      {isGrouped && (groupRestSeconds != null || groupNotes) && (
        <div style={{ marginTop: sp[3], fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium }}>
          {groupRestSeconds != null && (
            <span>⏱ {formatRestSeconds(groupRestSeconds)} entre rondas</span>
          )}
          {groupNotes && (
            <div style={{ marginTop: groupRestSeconds != null ? sp[1] : 0, fontStyle: "italic" }}>
              {groupNotes}
            </div>
          )}
        </div>
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
          {muscleGroups.length > 0 && (
            <><span style={{ margin: `0 ${sp[3]}px`, opacity: opacity.muted }}>•</span><span style={{ textTransform: "capitalize" }}>{muscleGroups.join(", ")}</span></>
          )}
          {estimatedMinutes > 0 && (
            <><span style={{ margin: `0 ${sp[3]}px`, opacity: opacity.muted }}>•</span><span>~{estimatedMinutes} min</span></>
          )}
        </div>
      </div>

      {expanded && (
        <div>
          {blocks.map((block, i) => {
            const gid = block[0].group_id;
            const color = gid != null ? ssGroupColors.get(gid) || null : null;
            const groupType = block[0].group_type;
            return (
              <div key={i}>
                <ExerciseBlock exercises={block} ssColor={color} groupType={groupType} />
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
        </div>
      )}
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
