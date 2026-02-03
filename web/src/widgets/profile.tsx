import { createRoot } from "react-dom/client";
import { useState, useCallback } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { WeekdayPills } from "./shared/weekday-pills.js";
import { sp, radius, font, weight } from "../tokens.js";
import { DiffValue, ConfirmBar } from "./shared/diff-components.js";
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

// ── Toggle Component ──

function Toggle({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? "toggle-checked" : ""}`}
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        border: "none",
        padding: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--primary)" : "var(--border)",
        transition: "background 0.2s",
        display: "flex",
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "white",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
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
    <div className="profile-card" role="status" aria-label="Loading profile">
      <div className="profile-header">
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: radius.full }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: 120, height: font["2xl"], marginBottom: sp[3] }} />
          <div className="skeleton" style={{ width: 180, height: font.base }} />
        </div>
      </div>
      <div className="profile-section profile-metrics">
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ textAlign: "center", flex: 1 }}>
            <div className="skeleton" style={{ width: 36, height: font["2xl"], margin: `0 auto ${sp[2]}px` }} />
            <div className="skeleton" style={{ width: 48, height: font.xs, margin: "0 auto" }} />
          </div>
        ))}
      </div>
      <div className="profile-section">
        <div className="skeleton" style={{ width: 100, height: font.xs, marginBottom: sp[4] }} />
        <div style={{ display: "flex", gap: sp[3] }}>
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div key={i} className="skeleton" style={{ width: 28, height: 28, borderRadius: radius.full }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DiffChips: array diff (case-insensitive, with badges) ──

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
    <header className="profile-header">
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 className="profile-name">{name}</h1>
        <div className="profile-subtitle">
          {subtitleParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="profile-sep" aria-hidden="true"> · </span>}
              {part}
            </span>
          ))}
        </div>
      </div>
    </header>
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

// ── Preferences Section ──

function PreferencesSection({ profile, onValidationToggle, saving }: {
  profile: Record<string, any>;
  onValidationToggle: (enabled: boolean) => void;
  saving: boolean;
}) {
  const requiresValidation = profile.requires_validation === true || profile.requires_validation === "true";

  return (
    <div className="profile-section">
      <div className="profile-section-label">PREFERENCES</div>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: sp[4],
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: font.base, fontWeight: weight.medium }}>
            Require validation
          </div>
          <div style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[1] }}>
            New workouts and programs need manual validation before affecting stats
          </div>
        </div>
        <Toggle
          checked={requiresValidation}
          onChange={onValidationToggle}
          disabled={saving}
        />
      </div>
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
  const [savingValidation, setSavingValidation] = useState(false);

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

  const handleValidationToggle = useCallback(async (enabled: boolean) => {
    setSavingValidation(true);
    const result = await callTool("manage_profile", { action: "update", data: { requires_validation: enabled } });
    setSavingValidation(false);
    if (result) {
      setLocalProfile(prev => ({ ...(prev || data?.profile || {}), requires_validation: enabled }));
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
    <article className="profile-card" aria-label="User profile">
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

      <PreferencesSection
        profile={profile}
        onValidationToggle={handleValidationToggle}
        saving={savingValidation}
      />

      {hasPending && (
        <ConfirmBar onConfirm={handleConfirm} confirming={confirming} confirmed={confirmed} className="profile-confirm-bar" />
      )}
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
