import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef, useMemo } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight, opacity, maxWidth } from "../tokens.js";
import { REP_UNIT, GROUP_LABELS, GroupIcon, formatRestSeconds } from "./shared/exercise-utils.js";
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
}

interface SessionData {
  session_id: number;
  started_at: string;
  ended_at?: string | null;
  duration_minutes: number;
  program_day: string | null;
  tags: string[];
  exercises_count: number;
  total_sets: number;
  total_volume_kg: number;
  muscle_groups: string[];
  exercises: ExerciseData[];
}

interface WorkoutsData {
  sessions: SessionData[];
  summary: { total_sessions: number; total_volume_kg: number; exercises_count: number };
  filters: { period: string; exercise?: string; program_day?: string; tags?: string[] };
}

// ── Helpers ──

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function periodLabel(period: string): string {
  if (period === "today") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  if (period === "year") return "This year";
  return `Last ${period} days`;
}

/** Format sets summary: "3×10r" or "3×8-12r" if variable reps */
function formatSetsSummary(sets: SetData[], repType?: string | null): string {
  if (sets.length === 0) return "";
  const unit = repType && REP_UNIT[repType] ? REP_UNIT[repType] : "r";
  const reps = sets.map(s => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  if (min === max) return `${sets.length}×${min}${unit}`;
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

// ── Skeleton ──

function SkeletonWorkouts() {
  return (
    <div className="profile-card" role="status" aria-label="Loading workouts">
      {/* Tabs skeleton */}
      <div style={{ display: "flex", gap: sp[2], borderBottom: "1px solid var(--border)", paddingBottom: sp[3], marginBottom: sp[6] }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ width: 70, height: 24, borderRadius: radius.sm }} />
        ))}
      </div>
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[2] }}>
          <div className="skeleton" style={{ width: 140, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 60, height: 20, borderRadius: radius.lg }} />
        </div>
        <div className="skeleton" style={{ width: 100, height: font.sm, marginBottom: sp[4] }} />
      </div>
      {/* Exercises skeleton */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[3] }}>
          <div className="skeleton" style={{ width: `${35 + i * 8}%`, height: font.lg }} />
          <div className="skeleton" style={{ width: 70, height: font.md }} />
        </div>
      ))}
      <span className="sr-only">Loading workouts...</span>
    </div>
  );
}

// ── Components ──

function ExerciseRow({ exercise, exNum, isLast }: {
  exercise: ExerciseData;
  exNum: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
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
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], minWidth: 0 }}>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.muted, minWidth: "1.2em", textAlign: "right", flexShrink: 0 }}>{exNum}</span>
          <span className="exercise-name" style={{
            fontWeight: weight.medium,
            fontSize: font.lg,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {exercise.name}
          </span>
        </div>
        {/* Right: sets × reps · weight */}
        <div className="exercise-metrics" style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: sp[1], fontSize: font.md, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: weight.semibold }}>{setsSummary}</span>
          {weightRange != null && (
            <>
              <span style={{ opacity: opacity.muted }}>·</span>
              <span style={{ fontWeight: weight.semibold }}>{weightRange}kg</span>
            </>
          )}
        </div>
      </div>

      {/* Per-set detail (expanded on row click) */}
      {hasPerSet && expanded && (
        <div className="per-set-detail">
          {exercise.sets.map((set, si) => (
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
                <span>
                  <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{set.reps}</span>
                  {set.weight != null && (
                    <>
                      <span style={{ opacity: opacity.muted, margin: `0 ${sp[1]}px` }}>×</span>
                      <span style={{ fontWeight: weight.medium, color: "var(--text)" }}>{set.weight}</span>
                      <span style={{ opacity: opacity.muted }}> kg</span>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseGroupBlock({ group, startIndex, collapsible = true }: {
  group: { exercises: ExerciseData[]; groupId: number | null; groupType: string | null; groupLabel: string | null; groupNotes: string | null; groupRestSeconds: number | null };
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
            <span aria-hidden="true" style={{ fontSize: font.sm, color: "var(--text-secondary)", transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
              ▼
            </span>
          )}
          <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>
            {headerLabel}
          </span>
          <span aria-hidden="true" style={{ color: "var(--text-secondary)", opacity: opacity.subtle, display: "inline-flex" }}>
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
        <div style={{ paddingLeft: sp[3] }}>
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

function groupExercises(exercises: ExerciseData[]): Array<{ exercises: ExerciseData[]; groupId: number | null; groupType: string | null; groupLabel: string | null; groupNotes: string | null; groupRestSeconds: number | null }> {
  const groups: Array<{ exercises: ExerciseData[]; groupId: number | null; groupType: string | null; groupLabel: string | null; groupNotes: string | null; groupRestSeconds: number | null }> = [];
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

/** Session tabs */
function SessionTabs({ sessions, activeIdx, goTo }: { sessions: SessionData[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = sessions.length;
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
  }, [sessions.length, activeIdx, goTo]);

  if (sessions.length <= 1) return null;

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Workouts"
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
      {sessions.map((session, i) => {
        const isActive = i === activeIdx;
        const label = session.program_day || formatShortDate(session.started_at);

        return (
          <button
            key={session.session_id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`session-panel-${i}`}
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
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`${label} - ${formatDate(session.started_at)}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Session display card */
function SessionCard({ session }: { session: SessionData }) {
  const muscleGroups = useMemo(() => session.muscle_groups || [], [session.muscle_groups]);
  const groups = useMemo(() => groupExercises(session.exercises), [session.exercises]);
  const isActive = !session.ended_at;

  let currentIdx = 1;

  return (
    <article aria-label={`Workout: ${session.program_day || formatDate(session.started_at)}`}>
      {/* Header */}
      <header style={{ marginBottom: sp[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], marginBottom: sp[1] }}>
          <h2 className="title" style={{ marginBottom: 0 }}>
            {session.program_day || "Workout"}
          </h2>
          {isActive ? (
            <span className="badge badge-success">Active</span>
          ) : (
            <span className="badge badge-muted">Completed</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: sp[4], flexWrap: "wrap" }}>
          <span style={{ fontSize: font.base, color: "var(--text-secondary)" }}>
            {formatDate(session.started_at)}
          </span>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {session.exercises_count} exercises · {formatDuration(session.duration_minutes)}
            {session.total_volume_kg > 0 && ` · ${session.total_volume_kg >= 1000 ? `${(session.total_volume_kg / 1000).toFixed(1)}t` : `${session.total_volume_kg}kg`}`}
          </span>
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
      </header>

      {/* Exercises */}
      <div role="list" aria-label="Exercises">
        {groups.map((group, gi) => {
          const startIdx = currentIdx;
          currentIdx += group.exercises.length;
          const hasSiblings = groups.length > 1;
          return (
            <div key={gi}>
              <ExerciseGroupBlock group={group} startIndex={startIdx} collapsible={hasSiblings} />
              {gi < groups.length - 1 && (
                <div style={{
                  borderBottom: "1px solid color-mix(in srgb, var(--border) 30%, transparent)",
                  marginBottom: sp[4],
                }} />
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

// ── Main Widget ──

function WorkoutsWidget() {
  const data = useToolOutput<WorkoutsData>();
  const [activeIdx, setActiveIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    if (data) {
      setActiveIdx(Math.max(0, Math.min(idx, data.sessions.length - 1)));
    }
  }, [data?.sessions.length]);

  if (!data) return <SkeletonWorkouts />;

  const { sessions, summary, filters } = data;

  if (sessions.length === 0) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <p style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[8]}px 0` }}>
          No workouts found for {periodLabel(filters.period).toLowerCase()}. Start a session to begin tracking!
        </p>
      </div>
    );
  }

  const activeSession = sessions[activeIdx];

  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label="Workout history"
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: sp[6] }}>
        <h1 style={{ fontSize: font["3xl"], fontWeight: 600, margin: 0 }}>
          Workouts
        </h1>
        <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
          {summary.total_sessions} sessions · {periodLabel(filters.period).toLowerCase()}
        </span>
      </div>

      {/* Active filters */}
      {(filters.exercise || filters.program_day || (filters.tags && filters.tags.length > 0)) && (
        <div style={{ display: "flex", gap: sp[2], flexWrap: "wrap", marginBottom: sp[4] }}>
          {filters.exercise && <span className="badge badge-primary">{filters.exercise}</span>}
          {filters.program_day && <span className="badge badge-primary">{filters.program_day}</span>}
          {filters.tags?.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
        </div>
      )}

      {/* Session tabs */}
      <SessionTabs sessions={sessions} activeIdx={activeIdx} goTo={goTo} />

      {/* Active session content */}
      <div role="tabpanel" id={`session-panel-${activeIdx}`} aria-live="polite">
        <SessionCard session={activeSession} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><WorkoutsWidget /></AppProvider>
);
