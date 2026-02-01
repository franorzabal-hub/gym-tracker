import { useState, useRef, useCallback } from "react";

export interface Exercise {
  exercise_name: string;
  target_sets: number;
  target_reps: number;
  target_weight: number | null;
  target_rpe: number | null;
  superset_group: number | null;
  group_type: "superset" | "paired" | "circuit" | null;
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
export const SS_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

// Consistent left padding for the content rail
export const RAIL_PX = 18;

export const GROUP_LABELS: Record<string, { icon: string; label: string }> = {
  superset: { icon: "⚡", label: "Superset" },
  paired: { icon: "🔗", label: "Paired" },
  circuit: { icon: "🔄", label: "Circuit" },
};

export function WeekdayPills({ days, viewingWeekdays, onWeekdayClick }: { days: Day[]; viewingWeekdays?: number[]; onWeekdayClick?: (dayIdx: number) => void }) {
  // Map each weekday number → first day index that uses it
  const weekdayToDayIdx = new Map<number, number>();
  days.forEach((d, idx) => d.weekdays?.forEach(w => {
    if (!weekdayToDayIdx.has(w)) weekdayToDayIdx.set(w, idx);
  }));
  const viewingSet = new Set(viewingWeekdays || []);

  return (
    <div style={{ display: "flex", gap: 3 }}>
      {WEEKDAY_LABELS.map((label, i) => {
        const dayNum = i + 1;
        const active = weekdayToDayIdx.has(dayNum);
        const viewing = viewingSet.has(dayNum);
        const clickable = active && onWeekdayClick;
        return (
          <div
            key={i}
            onClick={clickable ? () => onWeekdayClick(weekdayToDayIdx.get(dayNum)!) : undefined}
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
              cursor: clickable ? "pointer" : "default",
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

export function MuscleGroupTags({ exercises }: { exercises: Exercise[] }) {
  const groups = [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))] as string[];
  if (!groups.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {groups.map(g => (
        <span key={g} style={{
          fontSize: 12,
          padding: "2px 10px",
          borderRadius: 12,
          background: "var(--border)",
          color: "var(--text)",
          textTransform: "capitalize",
          fontWeight: 500,
          opacity: 0.7,
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
      fontSize: 11,
      fontWeight: 600,
      color,
      marginLeft: 4,
    }}>
      RPE {rpe}
    </span>
  );
}

/** Group exercises into blocks: supersets share a block, solo exercises are individual blocks */
export function groupIntoBlocks(exercises: Exercise[]): Exercise[][] {
  const blocks: Exercise[][] = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.superset_group != null) {
      const group = ex.superset_group;
      const block: Exercise[] = [];
      while (i < exercises.length && exercises[i].superset_group === group) {
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
      fontSize: 10,
      padding: "1px 7px",
      borderRadius: 8,
      background: "var(--border)",
      color: "var(--text)",
      textTransform: "capitalize",
      fontWeight: 500,
      marginLeft: 6,
      whiteSpace: "nowrap",
      opacity: 0.7,
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

export function ExerciseBlock({ exercises, ssColor, groupType }: { exercises: Exercise[]; ssColor: string | null; groupType: string | null }) {
  const isGrouped = exercises.length > 1;
  const type = groupType || "superset";

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
      borderBottomLeftRadius: isGrouped ? 8 : 0,
      paddingLeft: RAIL_PX,
      marginBottom: 4,
    }}>
      {isGrouped && (
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          color: labelColor,
          marginBottom: 4,
          letterSpacing: "0.5px",
          opacity: 0.8,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}>
          <span style={{ fontSize: 12 }}>{(GROUP_LABELS[type] || GROUP_LABELS.superset).icon}</span>
          {(GROUP_LABELS[type] || GROUP_LABELS.superset).label}
        </div>
      )}
      {exercises.map((ex, i) => {
        const note = cleanNotes(ex.notes, isGrouped, ex.muscle_group);
        const { repScheme, progression, rest: noteText } = parseNoteReps(note);
        return (
          <div key={i} style={{
            marginBottom: i < exercises.length - 1 ? 8 : 0,
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "0 8px" }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>
                {ex.exercise_name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{ex.target_sets}</span>
                <span style={{ opacity: 0.4 }}>×</span>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>
                  {repScheme ? `(${repScheme})` : ex.target_reps}
                </span>
                {ex.rep_type && REP_UNIT[ex.rep_type] && (
                  <span style={{ opacity: 0.5, fontSize: 11 }}>{REP_UNIT[ex.rep_type]}</span>
                )}
                {ex.target_weight != null && (
                  <>
                    <span style={{ opacity: 0.35, margin: "0 2px" }}>·</span>
                    <span style={{ fontWeight: 700, color: "var(--text)" }}>{ex.target_weight}</span>
                    <span style={{ opacity: 0.5, fontSize: 11 }}>kg</span>
                  </>
                )}
                {ex.target_rpe != null && <><span style={{ opacity: 0.35, margin: "0 2px" }}>·</span><RpeBadge rpe={ex.target_rpe} /></>}
                {ex.rest_seconds != null && (
                  <>
                    <span style={{ opacity: 0.25, margin: "0 3px" }}>|</span>
                    <span style={{ opacity: 0.6, fontSize: 11 }}>
                      ⏱ {ex.rest_seconds >= 60 ? `${Math.floor(ex.rest_seconds / 60)}′${ex.rest_seconds % 60 ? `${ex.rest_seconds % 60}″` : ""}` : `${ex.rest_seconds}″`}
                    </span>
                  </>
                )}
              </div>
            </div>
            {progression && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 11,
                color: "#b45309",
                fontWeight: 500,
                marginTop: 3,
                padding: "1px 8px",
                borderRadius: 10,
                background: "rgba(245, 158, 11, 0.1)",
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
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1, opacity: 0.7 }}>
                  {/^\d+\s*seg/i.test(noteText) ? `⏳ ${noteText}` : noteText}
                </div>
              );
            })()}
          </div>
        );
      })}
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
    if (ex.superset_group != null && !ssGroupColors.has(ex.superset_group)) {
      ssGroupColors.set(ex.superset_group, SS_COLORS[colorIdx % SS_COLORS.length]);
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
    <div style={{
      maxHeight: alwaysExpanded ? "70vh" : undefined,
      overflowY: alwaysExpanded ? "auto" : undefined,
    }}>
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
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{expanded ? "▲" : "▼"}</span>
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
        <div>
          {blocks.map((block, i) => {
            const ssGroup = block[0].superset_group;
            const color = ssGroup != null ? ssGroupColors.get(ssGroup) || null : null;
            const groupType = block[0].group_type;
            return (
              <div key={i}>
                <ExerciseBlock exercises={block} ssColor={color} groupType={groupType} />
                {i < blocks.length - 1 && (
                  <div style={{
                    borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                    marginLeft: RAIL_PX + 2,
                    marginBottom: 10,
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
