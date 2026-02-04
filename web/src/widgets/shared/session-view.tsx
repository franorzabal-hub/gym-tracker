import { useState, useEffect, useMemo } from "react";
import { sp, radius, font, weight, opacity } from "../../tokens.js";
import { useI18n } from "../../i18n/index.js";
import { useFormatters } from "../../i18n/formatters.js";
import { REP_UNIT, useGroupLabels, GroupIcon, formatRestSeconds } from "./exercise-utils.js";

// ── Types ──

export interface SetData {
  set_id: number;
  set_number: number;
  reps: number;
  weight: number | null;
  rpe: number | null;
  set_type: string;
  logged_at?: string | null;
}

export interface ExerciseData {
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

export interface SessionData {
  session_id: number;
  started_at: string;
  ended_at?: string | null;
  duration_minutes: number;
  program_day: string | null;
  tags: string[];
  exercises: ExerciseData[];
  is_validated?: boolean;
}

// ── Helpers ──

export function useLiveTimer(startedAt: string) {
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

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isPR(set: SetData, baseline: Record<string, number> | null | undefined): string | null {
  if (!baseline || !set.weight || set.set_type === "warmup") return null;
  if (baseline.max_weight != null && set.weight > baseline.max_weight) return "Weight PR";
  const e1rm = set.weight * (1 + (set.reps || 0) / 30);
  if (baseline.estimated_1rm != null && e1rm > baseline.estimated_1rm) return "1RM PR";
  return null;
}

export function exerciseHasPR(exercise: ExerciseData): boolean {
  return exercise.sets.some(s => isPR(s, exercise.pr_baseline) != null);
}

/** Format sets summary: "3×10r" or "3×8-12r" if variable reps (min-max range) */
export function formatSetsSummary(sets: SetData[], repType?: string | null): string {
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
export function formatWeightRange(sets: SetData[]): string | null {
  const weights = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0);
  if (weights.length === 0) return null;
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

// ── Grouping logic ──

export interface ExerciseGroup {
  exercises: ExerciseData[];
  groupId: number | null;
  groupType: string | null;
  groupLabel: string | null;
  groupNotes: string | null;
  groupRestSeconds: number | null;
}

export function groupExercises(exercises: ExerciseData[]): ExerciseGroup[] {
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

export interface WorkoutSection {
  sectionId: number;
  label: string;
  notes: string | null;
  groups: ExerciseGroup[];
}

export function groupIntoSections(exerciseGroups: ExerciseGroup[]): Array<{ type: "section"; section: WorkoutSection } | { type: "groups"; groups: ExerciseGroup[] }> {
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

// ── Skeleton ──

export function SkeletonWorkout() {
  return (
    <div className="profile-card" role="status" aria-label="Loading workout">
      {/* Header skeleton */}
      <div style={{ marginBottom: sp[8] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <div className="skeleton" style={{ width: 140, height: font["2xl"] }} />
            <div className="skeleton" style={{ width: 70, height: 20, borderRadius: radius.lg }} />
          </div>
          <div className="skeleton" style={{ width: 80, height: font.md }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: sp[2] }}>
            {[1, 2].map(i => (
              <div key={i} className="skeleton" style={{ width: 50, height: 20, borderRadius: radius.lg }} />
            ))}
          </div>
          <div className="skeleton" style={{ width: 100, height: font.sm }} />
        </div>
      </div>
      {/* Exercises skeleton */}
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: sp[4], paddingBottom: sp[3], borderBottom: "1px solid color-mix(in srgb, var(--border) 20%, transparent)" }}>
          <div className="skeleton" style={{ width: `${30 + i * 12}%`, height: font.base }} />
          <div className="skeleton" style={{ width: 80, height: font.sm }} />
        </div>
      ))}
    </div>
  );
}

// ── Components ──

export function ExerciseRow({ exercise, exNum, isLast }: {
  exercise: ExerciseData;
  exNum: number;
  isLast: boolean;
}) {
  const { t } = useI18n();
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
          position: "relative",
        }}
        onClick={hasPerSet ? () => setExpanded(!expanded) : undefined}
        onKeyDown={hasPerSet ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } } : undefined}
        role={hasPerSet ? "button" : undefined}
        aria-expanded={hasPerSet ? expanded : undefined}
        tabIndex={hasPerSet ? 0 : undefined}
      >
        {/* Number - positioned to the left, within profile-card padding (16px) */}
        <span style={{
          position: "absolute",
          left: -sp[6],
          fontSize: font.xs,
          color: "var(--text-secondary)",
          opacity: opacity.muted,
        }}>{exNum}</span>
        {/* Left: name */}
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[2], minWidth: 0 }}>
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
              <span style={{ opacity: opacity.muted }}>·</span>
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
                  <span style={{ minWidth: "3em" }}>{t("session.set")} {set.set_number}</span>
                  {set.set_type !== "working" && (
                    <span style={{
                      fontSize: font["2xs"],
                      color: set.set_type === "warmup" ? "var(--warning)" : set.set_type === "drop" ? "var(--success)" : "var(--danger)",
                      textTransform: "uppercase",
                    }}>
                      {set.set_type === "warmup" ? t("session.warmup") : set.set_type === "drop" ? t("session.drop") : t("session.failure")}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
                  {prevSet && prevSet.weight != null && (
                    <span style={{ fontSize: font.xs, opacity: opacity.medium }}>
                      {t("session.prev")}: {prevSet.reps}×{prevSet.weight}
                    </span>
                  )}
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
                  {prLabel && (
                    <span style={{
                      fontSize: font["2xs"], fontWeight: weight.bold, color: "var(--warning)",
                      background: "var(--pr-badge-bg)",
                      padding: `${sp[0.5]}px ${sp[2]}px`, borderRadius: radius.sm,
                    }}>
                      {t("session.pr")}
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

export function ExerciseGroupBlock({ group, startIndex, collapsible = true }: {
  group: ExerciseGroup;
  startIndex: number;
  collapsible?: boolean;
}) {
  const { t } = useI18n();
  const GROUP_LABELS = useGroupLabels();
  const isGrouped = group.exercises.length > 1 && group.groupId != null;
  const [expanded, setExpanded] = useState(true);
  const type = group.groupType || "superset";
  const headerLabel = group.groupLabel || GROUP_LABELS[type] || GROUP_LABELS.superset;

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
        onKeyDown={canCollapse ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } } : undefined}
        role={canCollapse ? "button" : undefined}
        aria-expanded={canCollapse ? expanded : undefined}
        tabIndex={canCollapse ? 0 : undefined}
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
            {t("groups.exerciseCount", { count: group.exercises.length })}
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

export function SectionCard({ section, startNumber }: {
  section: WorkoutSection;
  startNumber: number;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const exerciseCount = section.groups.reduce((sum, g) => sum + g.exercises.length, 0);

  let currentIdx = startNumber;

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
            {t("groups.exerciseCount", { count: exerciseCount })}
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
    </section>
  );
}

// ── Session Display ──

export function SessionDisplay({ session, readonly, onValidate, validating }: { session: SessionData; readonly?: boolean; onValidate?: () => void; validating?: boolean }) {
  const { t } = useI18n();
  const { formatDate: formatDateLocale } = useFormatters();
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
    <article className="profile-card" aria-label={t("workouts.workout")}>
      {/* Header */}
      <header style={{ marginBottom: sp[8] }}>
        {/* Title row: title + badge (left), date (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <h1 className="title" style={{ marginBottom: 0 }}>
              {isActive ? t("workouts.activeWorkout") : t("workouts.workout")}
            </h1>
            {isActive && <span className="badge badge-success">{t("common.active")}</span>}
            {!isActive && session.ended_at && session.is_validated !== false && <span className="badge badge-success">{t("workouts.completed")}</span>}
            {!isActive && session.is_validated === false && <span className="badge badge-warning">{t("programs.pendingValidation")}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            {!isActive && session.is_validated === false && onValidate && (
              <button
                className="btn btn-sm btn-primary"
                onClick={onValidate}
                disabled={validating}
                style={{ fontSize: font.sm, padding: `${sp[2]}px ${sp[4]}px` }}
              >
                {validating ? t("workouts.validating") : t("workouts.validate")}
              </button>
            )}
            {!isActive && session.ended_at && (
              <time dateTime={session.started_at} style={{ fontSize: font.md, color: "var(--text-secondary)" }}>
                {formatDateLocale(session.started_at)}
              </time>
            )}
          </div>
        </div>
        {/* Chips (left) + stats (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[2] }} role="list" aria-label={t("session.muscleGroups")}>
            {muscleGroups.map(g => (
              <span key={g} role="listitem" className="badge badge-muted" style={{ textTransform: "capitalize" }}>{g}</span>
            ))}
          </div>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {t("workouts.exerciseCount", { count: session.exercises.length })} <span aria-hidden="true">·</span> {isActive ? (
              <span style={{ color: "var(--primary)", fontWeight: weight.semibold }} aria-live="polite">{formatDuration(minutes)}</span>
            ) : formatDuration(minutes)}
          </span>
        </div>
      </header>

      {/* Exercise list - flat, no grouping */}
      <div role="list" aria-label={t("common.exercises")}>
        {session.exercises.map((exercise, i) => (
          <ExerciseRow key={exercise.name + i} exercise={exercise} exNum={i + 1} isLast={i === session.exercises.length - 1} />
        ))}
      </div>
    </article>
  );
}

/** Compact session card for lists - shows header with exercises inline */
export function SessionCard({ session }: { session: SessionData }) {
  const { t } = useI18n();
  const { formatDate: formatDateLocale } = useFormatters();
  const muscleGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const ex of session.exercises) {
      if (ex.muscle_group) groups.add(ex.muscle_group);
    }
    return Array.from(groups);
  }, [session.exercises]);

  return (
    <article aria-label={t("workouts.workout")}>
      {/* Header */}
      <header style={{ marginBottom: sp[6] }}>
        {/* Title row: day name + date + validation badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
            <h2 style={{ fontSize: font.xl, fontWeight: weight.semibold, margin: 0 }}>
              {session.program_day || formatDateLocale(session.started_at)}
            </h2>
            {session.is_validated === false && (
              <span className="badge badge-warning" style={{ fontSize: font.xs }}>{t("common.pending")}</span>
            )}
          </div>
          {session.program_day && (
            <time dateTime={session.started_at} style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
              {formatDateLocale(session.started_at)}
            </time>
          )}
        </div>
        {/* Chips + stats */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: sp[2] }}>
          <div style={{ display: "flex", alignItems: "center", gap: sp[2] }} role="list" aria-label={t("session.muscleGroups")}>
            {muscleGroups.map(g => (
              <span key={g} role="listitem" className="badge badge-muted" style={{ textTransform: "capitalize" }}>{g}</span>
            ))}
          </div>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)", opacity: opacity.medium }}>
            {t("workouts.exerciseCount", { count: session.exercises.length })} · {formatDuration(session.duration_minutes)}
          </span>
        </div>
      </header>

      {/* Exercise list */}
      <div role="list" aria-label={t("common.exercises")}>
        {session.exercises.map((exercise, i) => (
          <ExerciseRow key={exercise.name + i} exercise={exercise} exNum={i + 1} isLast={i === session.exercises.length - 1} />
        ))}
      </div>
    </article>
  );
}
