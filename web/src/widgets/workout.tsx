import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight, opacity, maxWidth } from "../tokens.js";
import "../styles.css";

// ── Types ──

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
  exercise_id?: number;
  name: string;
  group_id: number | null;
  group_type?: string | null;
  group_label?: string | null;
  group_notes?: string | null;
  group_rest_seconds?: number | null;
  section_id?: number | null;
  section_label?: string | null;
  section_notes?: string | null;
  muscle_group?: string | null;
  exercise_type?: string | null;
  rep_type?: string | null;
  sets: SetData[];
  previous?: { date: string; sets: { set_number: number; reps: number; weight: number | null; rpe: number | null; set_type: string }[] } | null;
  prs?: Record<string, number> | null;
  pr_baseline?: Record<string, number> | null;
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

interface ToolData {
  session: SessionData | null;
  readonly?: boolean;
}

// ── Constants ──

const REP_UNIT: Record<string, string> = {
  reps: "r",
  seconds: "s",
  meters: "m",
  calories: "cal",
};

const GROUP_LABELS: Record<string, string> = {
  superset: "Superset",
  paired: "Paired",
  circuit: "Circuit",
};

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

function formatRestSeconds(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}′${s}″` : `${m}′`;
  }
  return `${seconds}″`;
}

function isPR(set: SetData, baseline: Record<string, number> | null | undefined): string | null {
  if (!baseline || !set.weight || set.set_type === "warmup") return null;
  if (baseline.max_weight != null && set.weight > baseline.max_weight) return "Weight PR";
  const e1rm = set.weight * (1 + (set.reps || 0) / 30);
  if (baseline.estimated_1rm != null && e1rm > baseline.estimated_1rm) return "1RM PR";
  return null;
}

function exerciseHasPR(exercise: ExerciseData): boolean {
  return exercise.sets.some(s => isPR(s, exercise.pr_baseline) != null);
}

/** Format sets summary: "3×10r" or "3×8-12r" if variable reps (min-max range) */
function formatSetsSummary(sets: SetData[], repType?: string | null): string {
  if (sets.length === 0) return "";
  const unit = repType && REP_UNIT[repType] ? REP_UNIT[repType] : "r";
  const reps = sets.map(s => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  if (min === max) {
    return `${sets.length}×${min}${unit}`;
  }
  return `${sets.length}×${min}-${max}${unit}`;
}

/** Format weight range: "35kg" or "35-50kg" if variable */
function formatWeightRange(sets: SetData[]): string | null {
  const weights = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0);
  if (weights.length === 0) return null;
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

/** Monochromatic SVG icons for group types */
function GroupIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = { width: size, height: size, display: "block" };
  const color = "currentColor";
  if (type === "superset") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
        <path d="M2 5.5h10m-2.5-2.5L12 5.5 9.5 8" />
        <path d="M14 10.5H4m2.5-2.5L4 10.5 6.5 13" />
      </svg>
    );
  }
  if (type === "paired") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
        <path d="M6.5 9.5l3-3" />
        <path d="M9 5l1.5-1.5a2.12 2.12 0 0 1 3 3L12 8" />
        <path d="M7 8L5.5 9.5a2.12 2.12 0 0 0 3 3L10 11" />
      </svg>
    );
  }
  // circuit
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={s}>
      <path d="M13.5 8a5.5 5.5 0 0 1-9.17 4.1" />
      <path d="M2.5 8a5.5 5.5 0 0 1 9.17-4.1" />
      <path d="M11 1.5L11.67 3.9 9.27 4.57" />
      <path d="M5 14.5L4.33 12.1 6.73 11.43" />
    </svg>
  );
}

// ── Grouping logic ──

interface ExerciseGroup {
  exercises: ExerciseData[];
  groupId: number | null;
  groupType: string | null;
  groupLabel: string | null;
  groupNotes: string | null;
  groupRestSeconds: number | null;
}

function groupExercises(exercises: ExerciseData[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.group_id != null) {
      const gid = ex.group_id;
      const block: ExerciseData[] = [];
      while (i < exercises.length && exercises[i].group_id === gid) {
        block.push(exercises[i]);
        i++;
      }
      const first = block[0];
      groups.push({
        exercises: block,
        groupId: gid,
        groupType: first.group_type || null,
        groupLabel: first.group_label || null,
        groupNotes: first.group_notes || null,
        groupRestSeconds: first.group_rest_seconds || null,
      });
    } else {
      groups.push({
        exercises: [ex],
        groupId: null,
        groupType: null,
        groupLabel: null,
        groupNotes: null,
        groupRestSeconds: null,
      });
      i++;
    }
  }
  return groups;
}

interface WorkoutSection {
  sectionId: number;
  label: string;
  notes: string | null;
  groups: ExerciseGroup[];
}

function groupIntoSections(exerciseGroups: ExerciseGroup[]): Array<{ type: "section"; section: WorkoutSection } | { type: "groups"; groups: ExerciseGroup[] }> {
  const result: Array<{ type: "section"; section: WorkoutSection } | { type: "groups"; groups: ExerciseGroup[] }> = [];
  let currentUnsectioned: ExerciseGroup[] = [];
  const sectionMap = new Map<number, WorkoutSection>();

  for (const group of exerciseGroups) {
    const firstEx = group.exercises[0];
    const sectionId = firstEx?.section_id;

    if (sectionId != null) {
      if (currentUnsectioned.length > 0) {
        result.push({ type: "groups", groups: currentUnsectioned });
        currentUnsectioned = [];
      }

      if (!sectionMap.has(sectionId)) {
        const section: WorkoutSection = {
          sectionId,
          label: firstEx.section_label || "Section",
          notes: firstEx.section_notes || null,
          groups: [],
        };
        sectionMap.set(sectionId, section);
        result.push({ type: "section", section });
      }
      sectionMap.get(sectionId)!.groups.push(group);
    } else {
      currentUnsectioned.push(group);
    }
  }

  if (currentUnsectioned.length > 0) {
    result.push({ type: "groups", groups: currentUnsectioned });
  }

  return result;
}

// ── Components ──

function ExerciseRow({ exercise, exNum, isLast }: {
  exercise: ExerciseData;
  exNum: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasPR = exerciseHasPR(exercise);
  const hasPerSet = exercise.sets.length > 1;
  const setsSummary = formatSetsSummary(exercise.sets, exercise.rep_type);
  const weightRange = formatWeightRange(exercise.sets);

  return (
    <div style={{
      paddingBottom: isLast ? 0 : sp[3],
      marginBottom: isLast ? 0 : sp[3],
      borderBottom: isLast ? "none" : "1px solid color-mix(in srgb, var(--border) 20%, transparent)",
    }}>
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
        {/* Left: number + name */}
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[2], minWidth: 0 }}>
          <span style={{
            fontSize: font.xs,
            color: "var(--text-secondary)",
            opacity: 0.4,
            minWidth: 14,
            flexShrink: 0,
          }}>{exNum}</span>
          <span className="exercise-name" style={{
            fontWeight: weight.medium,
            fontSize: font.base,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {exercise.name}
          </span>
          {hasPR && (
            <span style={{
              fontSize: font["2xs"], fontWeight: weight.bold, color: "var(--warning)",
              background: "var(--pr-badge-bg)",
              padding: `${sp[0.5]}px ${sp[3]}px`, borderRadius: radius.sm,
              whiteSpace: "nowrap", flexShrink: 0,
            }}>
              PR
            </span>
          )}
        </div>
        {/* Right: sets × reps · weight */}
        <div className="exercise-metrics" style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: sp[1], fontSize: font.sm, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: weight.semibold }}>{setsSummary}</span>
          {weightRange != null && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontWeight: weight.semibold }}>{weightRange}kg</span>
            </>
          )}
        </div>
      </div>

      {/* Per-set detail (expanded on row click) */}
      {hasPerSet && expanded && (
        <div className="per-set-detail">
          {exercise.sets.map((set, si) => {
            const prLabel = isPR(set, exercise.pr_baseline);
            const prevSet = exercise.previous?.sets?.find(p => p.set_number === set.set_number);
            return (
              <div key={set.set_id} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: `${sp[1]}px 0`,
                fontSize: font.sm,
                color: "var(--text-secondary)",
                borderBottom: si < exercise.sets.length - 1 ? "1px solid color-mix(in srgb, var(--border) 30%, transparent)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
                  <span style={{ minWidth: "3em" }}>Set {set.set_number}</span>
                  {set.set_type !== "working" && (
                    <span style={{
                      fontSize: font["2xs"],
                      color: set.set_type === "warmup" ? "var(--warning)" : set.set_type === "drop" ? "var(--success)" : "var(--danger)",
                      textTransform: "uppercase",
                    }}>
                      {set.set_type}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
                  {prevSet && prevSet.weight != null && (
                    <span style={{ fontSize: font.xs, opacity: opacity.medium }}>
                      prev: {prevSet.reps}×{prevSet.weight}
                    </span>
                  )}
                  <span>
                    <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{set.reps}</span>
                    {set.weight != null && (
                      <>
                        <span style={{ opacity: 0.35, margin: `0 ${sp[1]}px` }}>×</span>
                        <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{set.weight}</span>
                        <span style={{ opacity: 0.5 }}> kg</span>
                      </>
                    )}
                  </span>
                  {set.rpe != null && (
                    <span style={{
                      color: set.rpe >= 9 ? "var(--danger)" : set.rpe >= 8 ? "var(--warning)" : "var(--text-secondary)",
                    }}>
                      @{set.rpe}
                    </span>
                  )}
                  {prLabel && (
                    <span style={{
                      fontSize: font["2xs"], fontWeight: weight.bold, color: "var(--warning)",
                      background: "var(--pr-badge-bg)",
                      padding: `${sp[0.5]}px ${sp[2]}px`, borderRadius: radius.sm,
                    }}>
                      PR
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExerciseGroupBlock({ group, startIndex, collapsible = true }: {
  group: ExerciseGroup;
  startIndex: number;
  collapsible?: boolean;
}) {
  const isGrouped = group.exercises.length > 1 && group.groupId != null;
  const [expanded, setExpanded] = useState(true);
  const type = group.groupType || "superset";
  const headerLabel = group.groupLabel || GROUP_LABELS[type] || "Superset";

  if (!isGrouped) {
    return (
      <div style={{ marginBottom: sp[2] }}>
        {group.exercises.map((ex, i) => (
          <ExerciseRow key={ex.name} exercise={ex} exNum={startIndex + i} isLast={i >= group.exercises.length - 1} />
        ))}
      </div>
    );
  }

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
      >
        <div style={{ display: "flex", alignItems: "center", gap: sp[2] }}>
          {canCollapse && (
            <span style={{ fontSize: font.sm, color: "var(--text-secondary)", transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
              ▼
            </span>
          )}
          <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
            {headerLabel}
          </span>
          <span style={{ color: "var(--text-secondary)", opacity: opacity.subtle, display: "inline-flex" }}>
            <GroupIcon type={type} size={font.md} />
          </span>
        </div>
        {canCollapse && (
          <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {group.exercises.length} ej.
          </span>
        )}
      </div>
      {/* Exercises */}
      {showExercises && (
        <div>
          {group.exercises.map((ex, i) => (
            <ExerciseRow key={ex.name} exercise={ex} exNum={startIndex + i} isLast={i >= group.exercises.length - 1} />
          ))}
          {/* Footer: group rest + notes */}
          {(group.groupRestSeconds != null || group.groupNotes) && (
            <div style={{ marginTop: sp[3], display: "flex", alignItems: "center", justifyContent: "flex-end", gap: sp[3] }}>
              {group.groupRestSeconds != null && (
                <span className="rest-badge">⏱ {formatRestSeconds(group.groupRestSeconds)}</span>
              )}
              {group.groupNotes && (
                <span style={{ fontSize: font.xs, color: "var(--text-secondary)", fontStyle: "italic", opacity: opacity.medium }}>
                  {group.groupNotes}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({ section, startNumber }: {
  section: WorkoutSection;
  startNumber: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const exerciseCount = section.groups.reduce((sum, g) => sum + g.exercises.length, 0);

  let currentIdx = startNumber;

  return (
    <div style={{ marginBottom: sp[5] }}>
      <div
        className="tappable section-header"
        onClick={() => setExpanded(!expanded)}
        style={{
          marginBottom: expanded ? sp[3] : 0,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <span style={{ fontSize: font.sm, color: "var(--text-secondary)", transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
              ▼
            </span>
            <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
              {section.label}
            </span>
          </div>
          <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {exerciseCount} ej.
          </span>
        </div>
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
        <div>
          {section.groups.map((group, gi) => {
            const startIdx = currentIdx;
            currentIdx += group.exercises.length;
            const hasSiblings = section.groups.length > 1;
            return (
              <div key={gi}>
                <ExerciseGroupBlock group={group} startIndex={startIdx} collapsible={hasSiblings} />
                {gi < section.groups.length - 1 && (
                  <div style={{
                    borderBottom: "1px solid color-mix(in srgb, var(--border) 30%, transparent)",
                    marginBottom: sp[4],
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

// ── Main widget ──

function WorkoutWidget() {
  const data = useToolOutput<ToolData>();

  if (!data) return <div className="loading">Loading...</div>;

  if (!data.session) {
    return (
      <div className="empty" style={{ padding: `${sp[16]}px ${sp[8]}px` }}>
        <div style={{ fontSize: font["2xl"], fontWeight: weight.medium, marginBottom: sp[4] }}>No workouts yet</div>
        <div style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
          Start your first session to begin tracking your exercises here.
        </div>
      </div>
    );
  }

  return <SessionDisplay session={data.session} readonly={data.readonly} />;
}

function SessionDisplay({ session, readonly }: { session: SessionData; readonly?: boolean }) {
  const liveMinutes = useLiveTimer(session.started_at);
  const isActive = !readonly && !session.ended_at;
  const minutes = isActive ? liveMinutes : session.duration_minutes;

  const muscleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const ex of session.exercises) {
      if (ex.muscle_group) groups.add(ex.muscle_group);
    }
    return Array.from(groups);
  }, [session.exercises]);

  return (
    <div className="profile-card">
      {/* Header */}
      <div style={{ marginBottom: sp[5] }}>
        {/* Title row: title + badge (left), date (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <span className="title" style={{ marginBottom: 0 }}>
              {isActive ? "Active Workout" : "Workout"}
            </span>
            {isActive && <span className="badge badge-success">Active</span>}
            {!isActive && session.ended_at && <span className="badge badge-muted">Completed</span>}
          </div>
          {!isActive && session.ended_at && (
            <span style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
              {new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
        {/* Chips (left) + stats (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[2] }}>
            {muscleGroups.map(g => (
              <span key={g} className="badge badge-muted" style={{ textTransform: "capitalize" }}>{g}</span>
            ))}
          </div>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {session.exercises.length} ej · {isActive ? (
              <span style={{ color: "var(--primary)", fontWeight: weight.semibold }}>{formatDuration(minutes)}</span>
            ) : formatDuration(minutes)}
          </span>
        </div>
      </div>

      {/* Divider with more spacing */}
      <div style={{
        borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
        marginBottom: sp[5],
      }} />

      {/* Exercise list - flat, no grouping */}
      <div>
        {session.exercises.map((exercise, i) => (
          <ExerciseRow key={exercise.name + i} exercise={exercise} exNum={i + 1} isLast={i === session.exercises.length - 1} />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
