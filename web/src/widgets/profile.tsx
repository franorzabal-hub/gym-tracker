import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useToolOutput, useCallTool } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { WeekdayPills } from "./shared/weekday-pills.js";
import { Toggle } from "./shared/toggle.js";
import { sp, radius, font, weight } from "../tokens.js";
import { DiffValue, ConfirmBar } from "./shared/diff-components.js";
import { useI18n, type Locale } from "../i18n/index.js";
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

/** Check if profile requires validation before applying changes */
function isValidationRequired(profile: Record<string, any>): boolean {
  return profile.requires_validation === true || profile.requires_validation === "true";
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
  const { t } = useI18n();
  return (
    <div className="profile-card" role="status" aria-label={t("profile.loadingProfile")}>
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
  const { t } = useI18n();
  const name = profile.name || "—";
  const exp = profile.experience_level;
  const days = profile.available_days?.length ?? profile.training_days_per_week ?? 0;
  const gym = profile.gym;

  const hasPending = !!pending;
  const nameChanged = hasPending && hasFieldChange(profile, pending!, "name");
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

  subtitleParts.push(<span key="days">{t("profile.perWeek", { count: days })}</span>);

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
        <h1 className="profile-name">
          {nameChanged ? (
            <DiffValue current={name} pending={pending!.name || "—"} />
          ) : (
            name
          )}
        </h1>
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
  const { t } = useI18n();
  const metrics = [
    { key: "age", label: t("profile.age"), unit: "", format: (v: any) => String(v) },
    { key: "weight_kg", label: t("profile.weightLabel"), unit: "kg", format: (v: any) => String(v) },
    { key: "height_cm", label: t("profile.heightLabel"), unit: "cm", format: (v: any) => String(v) },
    { key: "sex", label: t("profile.sex"), unit: "", format: (v: any) => v === "male" ? t("profile.male") : v === "female" ? t("profile.female") : String(v) },
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
  const { t } = useI18n();
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
      <div className="profile-section-label">{t("profile.trainingDays")}</div>
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
  const { t } = useI18n();
  const requiresValidation = isValidationRequired(profile);

  return (
    <div className="profile-section">
      <div className="profile-section-label">{t("profile.preferences")}</div>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: sp[4],
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: font.base, fontWeight: weight.medium }}>
            {t("profile.requireValidation")}
          </div>
          <div style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[1] }}>
            {t("profile.requireValidationDesc")}
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

// ── Language Section ──

function LanguageSection({ profile, onLanguageChange, saving }: {
  profile: Record<string, any>;
  onLanguageChange: (language: Locale) => void;
  saving: boolean;
}) {
  const { t, locale } = useI18n();
  const currentLang = (profile.language as Locale) || locale;

  return (
    <div className="profile-section">
      <div className="profile-section-label">{t("profile.language.title")}</div>
      <div style={{ display: "flex", gap: sp[2] }}>
        <button
          className={`chip ${currentLang === "en" ? "chip-active" : ""}`}
          onClick={() => onLanguageChange("en")}
          disabled={saving}
          style={{
            padding: `${sp[2]}px ${sp[4]}px`,
            borderRadius: radius.md,
            border: "1px solid var(--border)",
            background: currentLang === "en" ? "var(--primary)" : "transparent",
            color: currentLang === "en" ? "white" : "var(--text)",
            cursor: "pointer",
            fontWeight: weight.medium,
            fontSize: font.sm,
          }}
        >
          {t("profile.language.en")}
        </button>
        <button
          className={`chip ${currentLang === "es" ? "chip-active" : ""}`}
          onClick={() => onLanguageChange("es")}
          disabled={saving}
          style={{
            padding: `${sp[2]}px ${sp[4]}px`,
            borderRadius: radius.md,
            border: "1px solid var(--border)",
            background: currentLang === "es" ? "var(--primary)" : "transparent",
            color: currentLang === "es" ? "white" : "var(--text)",
            cursor: "pointer",
            fontWeight: weight.medium,
            fontSize: font.sm,
          }}
        >
          {t("profile.language.es")}
        </button>
      </div>
    </div>
  );
}

// ── Main widget ──

function ProfileWidget() {
  const { t, setLocale } = useI18n();
  const data = useToolOutput<ProfileData>();
  const { callTool } = useCallTool();
  const [confirming, setConfirming] = useState(false);
  const [changesApplied, setChangesApplied] = useState(false);
  const [localProfile, setLocalProfile] = useState<Record<string, any> | null>(null);
  const [savingValidation, setSavingValidation] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoAppliedRef = useRef(false);

  // Auto-apply changes when requires_validation is false
  useEffect(() => {
    if (!data?.pendingChanges || autoAppliedRef.current || changesApplied) return;

    const profile = data.profile || {};

    if (!isValidationRequired(profile) && Object.keys(data.pendingChanges).length > 0) {
      autoAppliedRef.current = true;
      console.log("[profile] Auto-applying changes (requires_validation=false):", data.pendingChanges);

      let cancelled = false;

      (async () => {
        setConfirming(true);
        try {
          await callTool("manage_profile", { action: "update", data: data.pendingChanges });
          if (cancelled) return;
          setLocalProfile(prev => ({ ...(prev || profile), ...data.pendingChanges }));
          setChangesApplied(true);
          setError(null);
        } catch (err) {
          console.error("[profile] Auto-apply error:", err);
          if (!cancelled) setError(t("profile.failedToSave"));
        } finally {
          if (!cancelled) setConfirming(false);
        }
      })();

      return () => { cancelled = true; };
    }
  }, [data, callTool, changesApplied]);

  const handleConfirm = useCallback(async () => {
    if (!data?.pendingChanges) return;

    setConfirming(true);
    console.log("[profile] Confirming changes:", data.pendingChanges);
    try {
      const result = await callTool("manage_profile", { action: "update", data: data.pendingChanges });
      console.log("[profile] callTool result:", result);
      // Always apply changes locally on success (result may vary by host)
      setLocalProfile(prev => ({ ...(prev || data.profile), ...data.pendingChanges }));
      setChangesApplied(true);  // Permanently hide pending UI
      setError(null);
    } catch (err) {
      console.error("[profile] callTool error:", err);
      setError(t("profile.failedToSave"));
    } finally {
      setConfirming(false);
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

  const handleLanguageChange = useCallback(async (language: Locale) => {
    setSavingLanguage(true);
    const result = await callTool("manage_profile", { action: "update", data: { language } });
    setSavingLanguage(false);
    if (result) {
      setLocalProfile(prev => ({ ...(prev || data?.profile || {}), language }));
      setLocale(language);
    }
  }, [data, callTool, setLocale]);

  if (!data) return <SkeletonCard />;

  const profile = localProfile || data.profile || {};
  const requiresValidation = isValidationRequired(profile);
  // Only show pending diff if requires_validation is true
  const pending = (changesApplied || !requiresValidation) ? undefined : data.pendingChanges;
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
        <ChipListWithDiff label={t("profile.goals")} current={goals} pending={pendingGoals} variant="primary" />
      ) : (
        <ChipList label={t("profile.goals")} items={goals} variant="primary" />
      )}

      {pendingSupplements ? (
        <ChipListWithDiff label={t("profile.supplements")} current={supplements} pending={pendingSupplements} variant="primary" />
      ) : (
        <ChipList label={t("profile.supplements")} items={supplements} variant="primary" />
      )}

      {pendingInjuries ? (
        <ChipListWithDiff label={t("profile.injuries")} current={injuries} pending={pendingInjuries} variant="warning" />
      ) : injuries.length > 0 ? (
        <ChipList label={t("profile.injuries")} items={injuries} variant="warning" />
      ) : null}

      <PreferencesSection
        profile={profile}
        onValidationToggle={handleValidationToggle}
        saving={savingValidation}
      />

      <LanguageSection
        profile={profile}
        onLanguageChange={handleLanguageChange}
        saving={savingLanguage}
      />

      {hasPending && (
        <ConfirmBar onConfirm={handleConfirm} confirming={confirming} confirmed={false} className="profile-confirm-bar" />
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: `${sp[3]}px ${sp[4]}px`,
            marginTop: sp[4],
            background: "var(--error-bg, #fef2f2)",
            color: "var(--error, #dc2626)",
            borderRadius: radius.md,
            fontSize: font.sm,
            fontWeight: weight.medium,
          }}
        >
          {error}
        </div>
      )}
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><ProfileWidget /></AppProvider>
);
