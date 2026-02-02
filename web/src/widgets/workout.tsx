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
  let currentGroup: ExerciseData[] = [];
  let currentGroupId: number | null = null;

  for (const ex of exercises) {
    if (ex.group_id != null && ex.group_id === currentGroupId) {
      currentGroup.push(ex);
    } else {
      if (currentGroup.length > 0) {
        const first = currentGroup[0];
        groups.push({
          exercises: currentGroup,
          groupId: currentGroupId,
          groupType: first.group_type || null,
          groupLabel: first.group_label || null,
          groupNotes: first.group_notes || null,
          groupRestSeconds: first.group_rest_seconds || null,
        });
      }
      currentGroup = [ex];
      currentGroupId = ex.group_id;
    }
  }
  if (currentGroup.length > 0) {
    const first = currentGroup[0];
    groups.push({
      exercises: currentGroup,
      groupId: currentGroupId,
      groupType: first.group_type || null,
      groupLabel: first.group_label || null,
      groupNotes: first.group_notes || null,
      groupRestSeconds: first.group_rest_seconds || null,
    });
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

// ── Group wrapper (superset / paired / circuit) ──

const GROUP_STYLES: Record<string, { icon: string; label: string; border: string }> = {
  superset: { icon: "\u26A1", label: "Superset", border: "3px solid var(--primary)" },
  paired:   { icon: "\uD83D\uDD17", label: "Paired",   border: "3px dashed var(--primary)" },
  circuit:  { icon: "\uD83D\uDD04", label: "Circuit",  border: "3px double var(--primary)" },
};

function formatRestSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}\u2032${s.toString().padStart(2, "0")}\u2033` : `${m}\u2032`;
}

function GroupWrapper({ groupType, groupLabel, groupNotes, groupRestSeconds, children }: {
  groupType: string | null;
  groupLabel: string | null;
  groupNotes: string | null;
  groupRestSeconds: number | null;
  children: React.ReactNode;
}) {
  const style = GROUP_STYLES[groupType || "superset"] || GROUP_STYLES.superset;
  return (
    <div style={{
      borderLeft: style.border,
      paddingLeft: sp[4],
      marginLeft: sp[1],
    }}>
      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: "var(--primary)", marginBottom: sp[1], textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: sp[2] }}>
        <span>{style.icon}</span>
        <span>{style.label}</span>
        {groupLabel && <span style={{ textTransform: "none", fontWeight: weight.medium, opacity: opacity.high }}>{"\u2014"} {groupLabel}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
        {children}
      </div>
      {(groupRestSeconds || groupNotes) && (
        <div style={{ marginTop: sp[2], fontSize: font.xs, color: "var(--text-secondary)" }}>
          {groupRestSeconds != null && groupRestSeconds > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: sp[1] }}>
              <span>{"\u23F1"}</span>
              <span>{formatRestSeconds(groupRestSeconds)} entre rondas</span>
            </div>
          )}
          {groupNotes && (
            <div style={{ fontStyle: "italic", marginTop: sp[1], opacity: opacity.high }}>{groupNotes}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section container ──

interface WorkoutSection {
  sectionId: number;
  label: string;
  notes: string | null;
  groups: ExerciseGroup[];
}

function groupIntoWorkoutSections(exerciseGroups: ExerciseGroup[]): Array<{ type: "section"; section: WorkoutSection } | { type: "groups"; groups: ExerciseGroup[] }> {
  const result: Array<{ type: "section"; section: WorkoutSection } | { type: "groups"; groups: ExerciseGroup[] }> = [];
  let currentUnsectioned: ExerciseGroup[] = [];

  // Group exercise groups by section
  const sectionMap = new Map<number, WorkoutSection>();
  const sectionOrder: number[] = [];

  for (const group of exerciseGroups) {
    const firstEx = group.exercises[0];
    const sectionId = firstEx?.section_id;

    if (sectionId != null) {
      // Flush unsectioned
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
        sectionOrder.push(sectionId);
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

function SectionContainer({ section, expandedExercise, onToggle, children }: {
  section: WorkoutSection;
  expandedExercise: string | null;
  onToggle: (name: string) => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const exerciseCount = section.groups.reduce((sum, g) => sum + g.exercises.length, 0);

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderRadius: radius.lg,
      padding: `${sp[4]}px ${sp[5]}px`,
      background: "color-mix(in srgb, var(--bg-secondary) 50%, transparent)",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: expanded ? sp[3] : 0,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: sp[3] }}>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {expanded ? "\u25BC" : "\u25B6"}
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
          {exerciseCount} ej.
        </span>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
          {children}
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
    <div style={{ maxWidth: maxWidth.widget, padding: `0 ${sp[8]}px ${sp[2]}px` }}>
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
      {(() => {
        const hasSections = session.exercises.some(e => e.section_id != null);

        const renderGroups = (groups: ExerciseGroup[]) => groups.map((group, gi) => {
          if (group.groupId != null && group.exercises.length > 1) {
            return (
              <GroupWrapper
                key={`g-${gi}`}
                groupType={group.groupType}
                groupLabel={group.groupLabel}
                groupNotes={group.groupNotes}
                groupRestSeconds={group.groupRestSeconds}
              >
                {group.exercises.map((ex) => (
                  <ExerciseAccordionRow
                    key={ex.name}
                    exercise={ex}
                    expanded={expandedExercise === ex.name}
                    onToggle={() => toggleExercise(ex.name)}
                  />
                ))}
              </GroupWrapper>
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
        });

        if (!hasSections) {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
              {renderGroups(exerciseGroups)}
            </div>
          );
        }

        const sectionedItems = groupIntoWorkoutSections(exerciseGroups);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: sp[2] }}>
            {sectionedItems.map((item, i) => {
              if (item.type === "section") {
                return (
                  <SectionContainer
                    key={`section-${item.section.sectionId}`}
                    section={item.section}
                    expandedExercise={expandedExercise}
                    onToggle={toggleExercise}
                  >
                    {renderGroups(item.section.groups)}
                  </SectionContainer>
                );
              }
              return (
                <div key={`unsectioned-${i}`}>
                  {renderGroups(item.groups)}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <WorkoutWidget />
  </AppProvider>,
);
