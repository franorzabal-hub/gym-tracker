import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { WeekdayPills } from "./shared/weekday-pills.js";
import "../styles.css";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Convert day name strings to weekday numbers (1=Mon ... 7=Sun) */
function dayNamesToNumbers(names: string[]): number[] {
  return names
    .map(n => DAYS_OF_WEEK.indexOf(n.toLowerCase()) + 1)
    .filter(n => n > 0);
}
const EMPTY_INJURY = /^(nada|ninguna|ninguno|none|no|n\/a|-|—)$/i;

interface ProfileData {
  profile: Record<string, any>;
  pendingChanges?: Record<string, any>;
}

// ── Helpers ──

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatFieldLabel(s: string): string {
  return capitalize(s.replace(/_/g, " "));
}

// ── Diff helpers ──

function arraysEqual(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

function hasFieldChange(
  profile: Record<string, any>,
  pending: Record<string, any>,
  field: string,
): boolean {
  if (!(field in pending)) return false;
  const curr = profile[field];
  const next = pending[field];
  if (Array.isArray(next) || Array.isArray(curr)) {
    return !arraysEqual(parseArray(curr), parseArray(next));
  }
  return String(curr ?? "") !== String(next ?? "");
}

// ── Skeleton ──

function SkeletonCard() {
  return (
    <div className="profile-card">
      <div className="profile-header">
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "50%" }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: 120, height: 18, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: 180, height: 13 }} />
        </div>
      </div>
      <div className="profile-section profile-metrics">
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ textAlign: "center", flex: 1 }}>
            <div className="skeleton" style={{ width: 36, height: 22, margin: "0 auto 4px" }} />
            <div className="skeleton" style={{ width: 48, height: 11, margin: "0 auto" }} />
          </div>
        ))}
      </div>
      <div className="profile-section">
        <div className="skeleton" style={{ width: 100, height: 11, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="skeleton" style={{ width: 28, height: 28, borderRadius: "50%" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DiffValue: scalar diff (old → new) ──

function DiffValue({ current, pending, format }: {
  current: any;
  pending: any;
  format?: (v: any) => string;
}) {
  const fmt = format || ((v: any) => String(v ?? "—"));
  const hasOld = current != null && current !== "";
  return (
    <span>
      {hasOld && <span className="diff-old">{fmt(current)}</span>}
      {hasOld && " "}
      <span className="diff-new">{fmt(pending)}</span>
    </span>
  );
}

// ── DiffChips: array diff ──

function DiffChips({ current, pending, variant = "primary" }: {
  current: string[];
  pending: string[];
  variant?: string;
}) {
  const currentSet = new Set(current.map(s => s.toLowerCase()));
  const pendingSet = new Set(pending.map(s => s.toLowerCase()));

  const unchanged = current.filter(s => pendingSet.has(s.toLowerCase()));
  const removed = current.filter(s => !pendingSet.has(s.toLowerCase()));
  const added = pending.filter(s => !currentSet.has(s.toLowerCase()));

  return (
    <div className="profile-chips">
      {unchanged.map(s => (
        <span key={s} className={`badge badge-${variant}`}>{formatFieldLabel(s)}</span>
      ))}
      {removed.map(s => (
        <span key={`rm-${s}`} className="badge diff-chip-removed">{formatFieldLabel(s)}</span>
      ))}
      {added.map(s => (
        <span key={`add-${s}`} className="badge diff-chip-added">+{formatFieldLabel(s)}</span>
      ))}
    </div>
  );
}

// ── ConfirmBar ──

function ConfirmBar({ onConfirm, confirming, confirmed }: {
  onConfirm: () => void;
  confirming: boolean;
  confirmed: boolean;
}) {
  return (
    <div className="profile-confirm-bar">
      {confirmed ? (
        <span className="profile-confirm-flash">Updated</span>
      ) : (
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={confirming}
          role="button"
          aria-label="Confirm profile changes"
        >
          {confirming ? "Saving..." : "Confirm Changes"}
        </button>
      )}
    </div>
  );
}

// ── ProfileHeader ──

function ProfileHeader({ profile, pending }: { profile: Record<string, any>; pending?: Record<string, any> }) {
  const name = profile.name || "—";
  const exp = profile.experience_level;
  const days = profile.available_days?.length ?? profile.training_days_per_week ?? 0;
  const gym = profile.gym;

  const hasPending = !!pending;
  const gymChanged = hasPending && hasFieldChange(profile, pending!, "gym");
  const expChanged = hasPending && hasFieldChange(profile, pending!, "experience_level");

  const displayExp = expChanged ? pending!.experience_level : exp;
  const displayGym = gymChanged ? null : gym; // handled inline with diff

  const subtitleParts: React.ReactNode[] = [];

  if (displayExp || exp) {
    if (expChanged) {
      subtitleParts.push(
        <span key="exp"><DiffValue current={exp ? capitalize(exp) : null} pending={capitalize(displayExp)} /></span>
      );
    } else if (exp) {
      subtitleParts.push(<span key="exp">{capitalize(exp)}</span>);
    }
  }

  subtitleParts.push(<span key="days">{days}x/week</span>);

  if (gymChanged) {
    subtitleParts.push(
      <span key="gym"><DiffValue current={gym ? gym.toUpperCase() : null} pending={pending!.gym.toUpperCase()} /></span>
    );
  } else if (displayGym) {
    subtitleParts.push(<span key="gym">{displayGym.toUpperCase()}</span>);
  }

  return (
    <div className="profile-header">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="profile-name">{name}</div>
        <div className="profile-subtitle">
          {subtitleParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="profile-sep"> · </span>}
              {part}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MetricsRow ──

function MetricsRow({ profile, pending }: { profile: Record<string, any>; pending?: Record<string, any> }) {
  const metrics = [
    { key: "age", label: "AGE", unit: "", format: (v: any) => String(v) },
    { key: "weight_kg", label: "WEIGHT", unit: "kg", format: (v: any) => String(v) },
    { key: "height_cm", label: "HEIGHT", unit: "cm", format: (v: any) => String(v) },
    { key: "sex", label: "SEX", unit: "", format: (v: any) => v === "male" ? "Male" : v === "female" ? "Female" : String(v) },
  ];

  return (
    <div className="profile-section profile-metrics">
      {metrics.map(m => {
        const current = profile[m.key];
        const changed = pending && hasFieldChange(profile, pending, m.key);
        return (
          <div key={m.key} className="profile-metric">
            <div className="profile-metric-value">
              {changed ? (
                <DiffValue current={current} pending={pending![m.key]} format={m.format} />
              ) : (
                current != null ? m.format(current) : "—"
              )}
            </div>
            <div className="profile-metric-label">
              {m.unit ? `${m.label} (${m.unit})` : m.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── TrainingDays ──

function TrainingDays({ profile, pending }: { profile: Record<string, any>; pending?: Record<string, any> }) {
  const currentDays: string[] = profile.available_days || [];
  const changed = pending && hasFieldChange(profile, pending, "available_days");
  const pendingDays: string[] = changed ? (pending!.available_days || []) : currentDays;

  const currentNums = dayNamesToNumbers(currentDays);
  const pendingNums = dayNamesToNumbers(pendingDays);

  const currentSet = new Set(currentNums);
  const pendingSet = new Set(pendingNums);

  // In diff mode, compute added/removed; active = unchanged (in both)
  const activeDays = changed
    ? currentNums.filter(n => pendingSet.has(n))
    : currentNums;
  const addedDays = changed
    ? pendingNums.filter(n => !currentSet.has(n))
    : undefined;
  const removedDays = changed
    ? currentNums.filter(n => !pendingSet.has(n))
    : undefined;

  return (
    <div className="profile-section">
      <div className="profile-section-label">TRAINING DAYS</div>
      <WeekdayPills
        activeDays={activeDays}
        addedDays={addedDays}
        removedDays={removedDays}
        size="md"
      />
    </div>
  );
}

// ── ChipList ──

function ChipList({ label, items, variant = "primary" }: {
  label: string;
  items: string[];
  variant?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="profile-section">
      <div className="profile-section-label">{label}</div>
      <div className="profile-chips">
        {items.map(s => (
          <span key={s} className={`badge badge-${variant}`}>{formatFieldLabel(s)}</span>
        ))}
      </div>
    </div>
  );
}

// ── ChipListWithDiff ──

function ChipListWithDiff({ label, current, pending, variant = "primary" }: {
  label: string;
  current: string[];
  pending: string[];
  variant?: string;
}) {
  // Show section if there's anything to display
  if (current.length === 0 && pending.length === 0) return null;
  return (
    <div className="profile-section">
      <div className="profile-section-label">{label}</div>
      <DiffChips current={current} pending={pending} variant={variant} />
    </div>
  );
}

// ── Main widget ──

function ProfileWidget() {
  const data = useToolOutput<ProfileData>();
  const { callTool } = useCallTool();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [localProfile, setLocalProfile] = useState<Record<string, any> | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!data?.pendingChanges) return;
    setConfirming(true);
    const result = await callTool("manage_profile", { action: "update", data: data.pendingChanges });
    setConfirming(false);
    if (result) {
      // Merge pending into local profile state
      setLocalProfile(prev => ({ ...(prev || data.profile), ...data.pendingChanges }));
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 2000);
    }
  }, [data, callTool]);

  if (!data) return <SkeletonCard />;

  const profile = localProfile || data.profile || {};
  const pending = confirmed ? undefined : data.pendingChanges;
  const hasPending = !!pending && Object.keys(pending).length > 0;

  // Parse array fields
  const goals = parseArray(profile.goals);
  const supplements = parseArray(profile.supplements);
  const injuries = parseArray(profile.injuries).filter(s => !EMPTY_INJURY.test(s.trim()));

  const pendingGoals = hasPending && hasFieldChange(profile, pending!, "goals") ? parseArray(pending!.goals) : null;
  const pendingSupplements = hasPending && hasFieldChange(profile, pending!, "supplements") ? parseArray(pending!.supplements) : null;
  const pendingInjuries = hasPending && hasFieldChange(profile, pending!, "injuries") ? parseArray(pending!.injuries).filter(s => !EMPTY_INJURY.test(s.trim())) : null;

  return (
    <div className="profile-card">
      <ProfileHeader profile={profile} pending={hasPending ? pending : undefined} />
      <MetricsRow profile={profile} pending={hasPending ? pending : undefined} />
      <TrainingDays profile={profile} pending={hasPending ? pending : undefined} />

      {pendingGoals ? (
        <ChipListWithDiff label="GOALS" current={goals} pending={pendingGoals} variant="primary" />
      ) : (
        <ChipList label="GOALS" items={goals} variant="primary" />
      )}

      {pendingSupplements ? (
        <ChipListWithDiff label="SUPPLEMENTS" current={supplements} pending={pendingSupplements} variant="primary" />
      ) : (
        <ChipList label="SUPPLEMENTS" items={supplements} variant="primary" />
      )}

      {pendingInjuries ? (
        <ChipListWithDiff label="INJURIES" current={injuries} pending={pendingInjuries} variant="warning" />
      ) : injuries.length > 0 ? (
        <ChipList label="INJURIES" items={injuries} variant="warning" />
      ) : null}

      {hasPending && (
        <ConfirmBar onConfirm={handleConfirm} confirming={confirming} confirmed={confirmed} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
