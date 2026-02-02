import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { ExerciseIcon, MUSCLE_COLOR } from "./shared/exercise-icons.js";
import { sp, radius, font, weight, opacity, maxWidth } from "../tokens.js";
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

interface ToolData {
  session: SessionData | null;
  readonly?: boolean;
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

// ── Set type badge (read-only) ──

const SET_TYPE_COLORS: Record<string, string> = {
  working: "var(--primary)",
  warmup: "var(--warning)",
  drop: "var(--success)",
  failure: "var(--danger)",
};

const SET_TYPE_LABELS: Record<string, string> = {
  working: "W",
  warmup: "WU",
  drop: "D",
  failure: "F",
};

function SetTypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        fontSize: font.xs,
        fontWeight: weight.semibold,
        color: SET_TYPE_COLORS[type] || "var(--text-secondary)",
        opacity: opacity.high,
        width: 18,
        textAlign: "center",
      }}
    >
      {SET_TYPE_LABELS[type] || type[0]?.toUpperCase() || "?"}
    </span>
  );
}

// ── Set row (read-only) ──

function SetRow({ set, prevSet, prLabel }: {
  set: SetData;
  prevSet?: PrevSetData | null;
  prLabel?: string | null;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: sp[3],
      minHeight: 28,
      padding: `${sp[1]}px 0`,
    }}>
      {/* Set number */}
      <span style={{
        width: sp[10], height: sp[10], borderRadius: radius.full,
        background: "var(--bg)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: font.xs, fontWeight: weight.semibold, color: "var(--text-secondary)",
        flexShrink: 0,
      }}>
        {set.set_number}
      </span>

      {/* Set type */}
      <SetTypeBadge type={set.set_type || "working"} />

      {/* Reps × Weight */}
      <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
        {set.reps}
        {set.weight != null && (
          <>
            <span style={{ fontSize: font.base, color: "var(--text-secondary)", margin: `0 ${sp[1]}px` }}>×</span>
            {set.weight}
            <span style={{ fontSize: font.xs, color: "var(--text-secondary)", marginLeft: sp[0.5] }}>kg</span>
          </>
        )}
      </span>

      {/* RPE */}
      {set.rpe != null && (
        <span style={{
          fontSize: font.base,
          color: set.rpe >= 9 ? "var(--danger)" : set.rpe >= 8 ? "var(--warning)" : "var(--success)",
        }}>
          @{set.rpe}
        </span>
      )}

      <span style={{ flex: 1 }} />

      {/* Previous ref */}
      {prevSet && prevSet.weight != null && (
        <span style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium, whiteSpace: "nowrap" }}>
          prev: {prevSet.weight}×{prevSet.reps}
        </span>
      )}

      {/* PR badge */}
      {prLabel && (
        <span style={{
          fontSize: font["2xs"], fontWeight: weight.bold, color: "var(--warning)",
          background: "var(--pr-badge-bg)",
          padding: `${sp[0.5]}px ${sp[3]}px`, borderRadius: radius.sm,
          whiteSpace: "nowrap",
        }}>
          PR
        </span>
      )}
    </div>
  );
}

// ── Exercise accordion row (read-only) ──

function ExerciseAccordionRow({ exercise, expanded, onToggle }: {
  exercise: ExerciseData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const muscleColor = exercise.muscle_group ? MUSCLE_COLOR[exercise.muscle_group.toLowerCase()] || "var(--text-secondary)" : "var(--text-secondary)";
  const hasPRs = exercise.sets.some(s => isPR(s, exercise.prs) != null);
  const prevSets = exercise.previous?.sets || [];

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Collapsed header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: sp[4],
          padding: `${sp[5]}px ${sp[6]}px`,
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.1s",
          background: expanded ? "var(--bg-secondary)" : "transparent",
        }}
      >
        <ExerciseIcon name={exercise.name} color={muscleColor} size={18} />

        <span style={{ fontWeight: weight.semibold, fontSize: font.md, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {exercise.name}
        </span>

        {exercise.muscle_group && (
          <span style={{
            fontSize: font["2xs"], padding: `${sp[0.5]}px ${sp[3]}px`, borderRadius: radius.sm,
            background: `color-mix(in srgb, ${muscleColor} 9%, transparent)`,
            color: muscleColor,
            fontWeight: weight.medium, textTransform: "capitalize",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {exercise.muscle_group}
          </span>
        )}

        {hasPRs && (
          <span style={{
            fontSize: font["2xs"], fontWeight: weight.bold, color: "var(--warning)",
            background: "var(--pr-badge-bg)",
            padding: `${sp[0.5]}px ${sp[3]}px`, borderRadius: radius.sm,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            PR
          </span>
        )}

        <span style={{ fontSize: font.sm, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {exercise.sets.length} set{exercise.sets.length !== 1 ? "s" : ""}
          {" · "}
          {weightRange(exercise.sets)}
        </span>

        <span style={{
          fontSize: font.sm, color: "var(--text-secondary)",
          transition: "transform 0.15s",
          transform: expanded ? "rotate(90deg)" : "none",
          flexShrink: 0,
        }}>
          ▸
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: `${sp[2]}px ${sp[6]}px ${sp[5]}px` }}>
          {/* Previous workout summary */}
          {exercise.previous && (
            <div style={{ fontSize: font.xs, color: "var(--text-secondary)", opacity: opacity.medium, marginBottom: sp[3] }}>
              Previous ({new Date(exercise.previous.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}):
              {" "}{exercise.previous.sets.map((s) =>
                s.weight != null ? `${s.weight}×${s.reps}` : `${s.reps}r`
              ).join(", ")}
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
                    prevSet={matchingPrev}
                    prLabel={prLabel}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Superset group wrapper ──

function SupersetWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      borderLeft: "3px solid var(--primary)",
      paddingLeft: sp[4],
      marginLeft: sp[1],
    }}>
      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: "var(--primary)", marginBottom: sp[1], textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Superset
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
        {children}
      </div>
    </div>
  );
}

// ── Main widget ──

function WorkoutWidget() {
  const data = useToolOutput<ToolData>();

  if (!data) return <div className="loading">Loading...</div>;

  if (!data.session) {
    return (
      <div className="empty" style={{ padding: sp[16] }}>
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
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalVolume = session.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0),
    0,
  );

  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  const toggleExercise = useCallback((name: string) => {
    setExpandedExercise(prev => prev === name ? null : name);
  }, []);

  const muscleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const ex of session.exercises) {
      if (ex.muscle_group) groups.add(ex.muscle_group);
    }
    return Array.from(groups);
  }, [session.exercises]);

  const exerciseGroups = useMemo(() => groupExercises(session.exercises), [session.exercises]);

  return (
    <div style={{ maxWidth: maxWidth.widget }}>
      {/* Header */}
      <div style={{ marginBottom: sp[5] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[4], minWidth: 0 }}>
            <span style={{ fontWeight: weight.semibold, fontSize: font.xl }}>
              {isActive ? "Active Workout" : "Workout"}
            </span>
            {session.program_day && (
              <span className="badge badge-primary" style={{ fontSize: font.xs }}>{session.program_day}</span>
            )}
            {!isActive && session.ended_at && (
              <span className="badge" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", fontSize: font.xs }}>
                Completed
              </span>
            )}
          </div>
          <span style={{ fontWeight: weight.semibold, fontSize: font.lg, color: isActive ? "var(--primary)" : "var(--text-secondary)" }}>
            {formatDuration(minutes)}
          </span>
        </div>

        {/* Summary stats + muscle groups + tags */}
        <div style={{ display: "flex", gap: sp[6], marginTop: sp[2], fontSize: font.sm, color: "var(--text-secondary)", flexWrap: "wrap", alignItems: "center" }}>
          {!isActive && session.ended_at && (
            <span>{new Date(session.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
          )}
          <span>{session.exercises.length} exercise{session.exercises.length !== 1 ? "s" : ""}</span>
          <span>{totalSets} set{totalSets !== 1 ? "s" : ""}</span>
          {totalVolume > 0 && <span>{Math.round(totalVolume).toLocaleString()} kg</span>}

          {muscleGroups.map((mg) => {
            const c = MUSCLE_COLOR[mg.toLowerCase()] || "var(--text-secondary)";
            return (
              <span key={mg} style={{
                fontSize: font["2xs"], padding: `${sp[0.5]}px ${sp[3]}px`, borderRadius: radius.sm,
                background: `color-mix(in srgb, ${c} var(--muscle-chip-alpha, 9%), transparent)`,
                color: c,
                fontWeight: weight.medium, textTransform: "capitalize",
              }}>
                {mg}
              </span>
            );
          })}

          {session.tags.map((tag) => (
            <span key={tag} className="badge badge-success" style={{ fontSize: font["2xs"] }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Exercise accordion */}
      <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
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
            />
          ));
        })}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
