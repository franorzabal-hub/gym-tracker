import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import { sp, radius, font, weight, opacity, maxWidth } from "../tokens.js";
import "../styles.css";
import { Sparkline, BarChart, HorizontalBars } from "./shared/charts.js";
import { useI18n } from "../i18n/index.js";
import { useFormatters } from "../i18n/formatters.js";

// ── Types ──

interface DashboardData {
  period: string;
  metric?: string;
  streak?: { current_weeks: number; longest_weeks: number; this_week: number; target: number };
  volume_weekly?: Array<{ week: string; volume: number }>;
  frequency?: { avg_per_week: number; total: number; weekly: Array<{ week: string; count: number }> };
  recent_prs?: Array<{ exercise: string; record_type: string; value: number; achieved_at: string }>;
  muscle_groups?: Array<{ muscle_group: string; volume: number; sets: number }>;
  body_weight?: Array<{ value: number; measured_at: string }>;
  top_exercises?: Array<{ exercise: string; volume: number; sessions: number }>;
  pending_validation?: { sessions: number; programs: number; message: string };
}

// ── Helpers ──

function usePeriodLabel() {
  const { t } = useI18n();
  return (period: string): string => {
    if (period === "week") return t("periods.thisWeek");
    if (period === "month") return t("periods.thisMonth");
    if (period === "year") return t("periods.thisYear");
    return t("periods.lastNDays", { count: period });
  };
}

// ── Validation Banner ──

function ValidationBanner({ data }: { data: DashboardData["pending_validation"] }) {
  if (!data || (data.sessions === 0 && data.programs === 0)) return null;

  return (
    <div
      style={{
        background: "var(--warning-bg, rgba(234, 179, 8, 0.1))",
        border: "1px solid var(--warning)",
        borderRadius: radius.md,
        padding: `${sp[4]}px ${sp[5]}px`,
        marginBottom: sp[6],
        display: "flex",
        alignItems: "center",
        gap: sp[3],
      }}
    >
      <span style={{ fontSize: font.lg }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: font.sm, fontWeight: weight.medium, color: "var(--warning)" }}>
          {data.message}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──

function SkeletonDashboard() {
  const { t } = useI18n();
  return (
    <div className="profile-card" role="status" aria-label={t("dashboard.loadingDashboard")}>
      {/* Card skeleton */}
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: radius.md,
        padding: `${sp[6]}px ${sp[8]}px`,
      }}>
        {/* Header skeleton */}
        <div style={{ display: "flex", alignItems: "center", gap: sp[3], marginBottom: sp[5] }}>
          <div className="skeleton" style={{ width: 16, height: 16, borderRadius: radius.sm }} />
          <div className="skeleton" style={{ width: 100, height: font.sm }} />
        </div>
        {/* Value skeleton */}
        <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], marginBottom: sp[3] }}>
          <div className="skeleton" style={{ width: 60, height: font["2xl"] }} />
          <div className="skeleton" style={{ width: 30, height: font.sm }} />
        </div>
        {/* Chart skeleton */}
        <div className="skeleton" style={{ width: "100%", height: 70, borderRadius: radius.sm, marginTop: sp[4] }} />
      </div>
      {/* Dots skeleton */}
      <div style={{ display: "flex", justifyContent: "center", gap: sp[3], marginTop: sp[5] }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ width: 8, height: 8, borderRadius: radius.full }} />
        ))}
      </div>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

// ── Card wrapper ──

function Card({ title, icon, children, fullWidth }: { title: string; icon: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: radius.md,
        padding: `${sp[6]}px ${sp[8]}px`,
        width: fullWidth ? "100%" : undefined,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: sp[3], marginBottom: sp[5] }}>
        <span style={{ fontSize: font.md }}>{icon}</span>
        <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ── Individual KPI Cards ──

function StreakCard({ data, fullWidth }: { data: DashboardData["streak"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data) return null;
  const { current_weeks, longest_weeks, this_week } = data;
  return (
    <Card title={t("dashboard.streak")} icon="↗" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[3] }}>
        <span className="stat-value">{current_weeks}</span>
        <span className="stat-label">{t("common.weeks")}</span>
      </div>
      <div style={{ fontSize: font.sm, color: "var(--text-secondary)", marginTop: sp[3] }}>
        {this_week > 0
          ? t("dashboard.sessionsThisWeek", { count: this_week })
          : t("dashboard.noSessionsYet")}
      </div>
      {longest_weeks > current_weeks && (
        <div style={{ fontSize: font.xs, color: "var(--text-secondary)", marginTop: sp[1], opacity: opacity.subtle }}>
          {t("dashboard.bestStreak", { count: longest_weeks })}
        </div>
      )}
    </Card>
  );
}

function VolumeCard({ data, fullWidth }: { data: DashboardData["volume_weekly"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  const { formatLargeNumber } = useFormatters();
  if (!data || data.length === 0) {
    return (
      <Card title={t("dashboard.weeklyVolume")} icon="◆" fullWidth={fullWidth}>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[6]}px 0`, textAlign: "center" }}>
          {t("dashboard.noVolumeData")}
        </div>
      </Card>
    );
  }
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const diff = prev ? ((last.volume - prev.volume) / (prev.volume || 1)) * 100 : 0;
  const weekLabels = data.map((d) => {
    const parts = d.week.split("-");
    return `${parts[1]}/${parts[2]}`;
  });

  return (
    <Card title={t("dashboard.weeklyVolume")} icon="◆" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], marginBottom: sp[3] }}>
        <span className="stat-value">{formatLargeNumber(last.volume)}</span>
        <span className="stat-label">{t("common.kg")}</span>
        {prev && diff !== 0 && (
          <span className={`badge ${diff > 0 ? "badge-success" : "badge-danger"}`} style={{ marginLeft: sp[2] }}>
            {diff > 0 ? "+" : ""}{diff.toFixed(0)}%
          </span>
        )}
      </div>
      <BarChart
        data={data.map((d, i) => ({ label: weekLabels[i], value: d.volume }))}
        width={fullWidth ? 320 : 240}
        height={70}
      />
    </Card>
  );
}

function FrequencyCard({ data, fullWidth }: { data: DashboardData["frequency"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data || data.weekly.length === 0) {
    return (
      <Card title={t("dashboard.frequency")} icon="▦" fullWidth={fullWidth}>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[6]}px 0`, textAlign: "center" }}>
          {t("dashboard.noSessionsData")}
        </div>
      </Card>
    );
  }
  return (
    <Card title={t("dashboard.frequency")} icon="▦" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], marginBottom: sp[3] }}>
        <span className="stat-value">{data.avg_per_week}</span>
        <span className="stat-label">{t("dashboard.sessionsPerWeek")}</span>
      </div>
      <Sparkline
        data={data.weekly.map((w) => w.count)}
        width={fullWidth ? 320 : 200}
        height={45}
      />
      <div style={{ fontSize: font.xs, color: "var(--text-secondary)", marginTop: sp[2] }}>
        {t("dashboard.totalSessions", { count: data.total })}
      </div>
    </Card>
  );
}

function PRsCard({ data, fullWidth }: { data: DashboardData["recent_prs"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data || data.length === 0) {
    return (
      <Card title={t("dashboard.recentPRs")} icon="★" fullWidth={fullWidth}>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[6]}px 0`, textAlign: "center" }}>
          {t("dashboard.noPRsYet")}
        </div>
      </Card>
    );
  }

  const typeLabel: Record<string, string> = {
    max_weight: t("dashboard.prTypes.max_weight"),
    max_reps_at_weight: t("dashboard.prTypes.max_reps_at_weight"),
    estimated_1rm: t("dashboard.prTypes.estimated_1rm"),
  };

  return (
    <Card title={t("dashboard.recentPRs")} icon="★" fullWidth={fullWidth}>
      {data.map((pr, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: `${sp[2]}px 0`,
            borderBottom: i < data.length - 1 ? "1px solid var(--border)" : "none",
          }}
        >
          <div>
            <div style={{ fontSize: font.base, fontWeight: weight.medium }}>{pr.exercise}</div>
            <div style={{ fontSize: font.xs, color: "var(--text-secondary)" }}>
              {typeLabel[pr.record_type] || pr.record_type}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: font.base, fontWeight: weight.bold, color: "var(--warning)" }}>{pr.value}</div>
            <div style={{ fontSize: font["2xs"], color: "var(--text-secondary)" }}>{pr.achieved_at}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

function MuscleGroupCard({ data, fullWidth }: { data: DashboardData["muscle_groups"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data || data.length === 0) {
    return (
      <Card title={t("dashboard.muscleGroups")} icon="●" fullWidth={fullWidth}>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[6]}px 0`, textAlign: "center" }}>
          {t("dashboard.noMuscleData")}
        </div>
      </Card>
    );
  }
  return (
    <Card title={t("dashboard.muscleGroups")} icon="●" fullWidth={fullWidth}>
      <HorizontalBars
        data={data.slice(0, 6).map((d) => ({
          label: d.muscle_group,
          value: d.volume,
          suffix: " kg",
        }))}
        width={fullWidth ? 320 : 260}
      />
    </Card>
  );
}

function BodyWeightCard({ data, fullWidth }: { data: DashboardData["body_weight"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data || data.length === 0) return null;

  const first = data[0].value;
  const last = data[data.length - 1].value;
  const diff = last - first;

  return (
    <Card title={t("dashboard.bodyWeight")} icon="△" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: sp[3], marginBottom: sp[3] }}>
        <span className="stat-value">{last.toFixed(1)}</span>
        <span className="stat-label">kg</span>
        {data.length > 1 && diff !== 0 && (
          <span className={`badge ${diff < 0 ? "badge-success" : "badge-warning"}`} style={{ marginLeft: sp[2] }}>
            {diff > 0 ? "+" : ""}{diff.toFixed(1)} kg
          </span>
        )}
      </div>
      <Sparkline
        data={data.map((d) => d.value)}
        width={fullWidth ? 320 : 200}
        height={45}
        color="var(--success)"
      />
    </Card>
  );
}

function TopExercisesCard({ data, fullWidth }: { data: DashboardData["top_exercises"]; fullWidth?: boolean }) {
  const { t } = useI18n();
  if (!data || data.length === 0) {
    return (
      <Card title={t("dashboard.topExercises")} icon="▲" fullWidth={fullWidth}>
        <div style={{ fontSize: font.base, color: "var(--text-secondary)", padding: `${sp[6]}px 0`, textAlign: "center" }}>
          {t("dashboard.noTopExercises")}
        </div>
      </Card>
    );
  }
  return (
    <Card title={t("dashboard.topExercises")} icon="▲" fullWidth={fullWidth}>
      <HorizontalBars
        data={data.map((d) => ({
          label: d.exercise,
          value: d.volume,
          suffix: " kg",
        }))}
        width={fullWidth ? 320 : 260}
      />
    </Card>
  );
}

// ── Dashboard Tabs ──

interface DashboardCard {
  key: string;
  label: string;
  icon: string;
  render: () => React.ReactNode;
}

function DashboardTabs({ cards, activeIdx, goTo }: { cards: DashboardCard[]; activeIdx: number; goTo: (idx: number) => void }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const len = cards.length;
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
  }, [cards.length, activeIdx, goTo]);

  if (cards.length <= 1) return null;

  return (
    <div
      ref={tabsRef}
      role="tablist"
      aria-label="Dashboard metrics"
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
      {cards.map((card, i) => {
        const isActive = i === activeIdx;

        return (
          <button
            key={card.key}
            role="tab"
            aria-selected={isActive}
            aria-controls={`dashboard-panel-${i}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => goTo(i)}
            className="day-tab"
            style={{
              display: "flex",
              alignItems: "center",
              gap: sp[2],
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
            }}
          >
            <span>{card.icon}</span>
            <span>{card.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main Widget ──

function DashboardWidget() {
  const { t } = useI18n();
  const periodLabel = usePeriodLabel();
  const data = useToolOutput<DashboardData>();
  const [activeIdx, setActiveIdx] = useState(0);

  const goTo = useCallback((idx: number) => {
    setActiveIdx(idx);
  }, []);

  if (!data) return <SkeletonDashboard />;

  // Build list of available cards with labels
  const cards: DashboardCard[] = [];

  if (data.streak) cards.push({ key: "streak", label: t("dashboard.streak"), icon: "↗", render: () => <StreakCard data={data.streak} fullWidth /> });
  if (data.volume_weekly) cards.push({ key: "volume", label: t("dashboard.volume"), icon: "◆", render: () => <VolumeCard data={data.volume_weekly} fullWidth /> });
  if (data.frequency) cards.push({ key: "frequency", label: t("dashboard.frequency"), icon: "▦", render: () => <FrequencyCard data={data.frequency} fullWidth /> });
  if (data.recent_prs) cards.push({ key: "prs", label: t("dashboard.prs"), icon: "★", render: () => <PRsCard data={data.recent_prs} fullWidth /> });
  if (data.muscle_groups) cards.push({ key: "muscle_groups", label: t("dashboard.muscleGroups"), icon: "●", render: () => <MuscleGroupCard data={data.muscle_groups} fullWidth /> });
  if (data.body_weight) cards.push({ key: "body_weight", label: t("dashboard.bodyWeight"), icon: "△", render: () => <BodyWeightCard data={data.body_weight} fullWidth /> });
  if (data.top_exercises) cards.push({ key: "top_exercises", label: t("dashboard.topExercises"), icon: "▲", render: () => <TopExercisesCard data={data.top_exercises} fullWidth /> });

  if (cards.length === 0) {
    return (
      <div className="profile-card" style={{ maxWidth: maxWidth.widget }}>
        <div style={{ textAlign: "center", padding: `${sp[12]}px ${sp[8]}px` }}>
          <div style={{ fontSize: font["2xl"], marginBottom: sp[4] }}>📊</div>
          <div style={{ fontSize: font.lg, fontWeight: weight.semibold, marginBottom: sp[2] }}>{t("dashboard.noTrainingData")}</div>
          <div style={{ fontSize: font.base, color: "var(--text-secondary)" }}>
            {t("dashboard.startLogging")}
          </div>
        </div>
      </div>
    );
  }

  // Clamp activeIdx if cards changed
  const safeIdx = Math.min(activeIdx, cards.length - 1);

  // Single metric → show full width, no tabs
  if (data.metric && cards.length === 1) {
    return (
      <div
        className="profile-card"
        style={{ maxWidth: maxWidth.widget }}
        role="region"
        aria-label={t("dashboard.title")}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: sp[6] }}>
          <h1 style={{ fontSize: font["3xl"], fontWeight: weight.semibold, margin: 0 }}>
            {t("dashboard.title")}
          </h1>
          <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
            {periodLabel(data.period)}
          </span>
        </div>
        <ValidationBanner data={data.pending_validation} />
        {cards[0].render()}
      </div>
    );
  }

  // Multiple cards → tabs
  return (
    <div
      className="profile-card"
      style={{ maxWidth: maxWidth.widget }}
      role="region"
      aria-label={t("dashboard.title")}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: sp[6] }}>
        <h1 style={{ fontSize: font["3xl"], fontWeight: weight.semibold, margin: 0 }}>
          {t("dashboard.title")}
        </h1>
        <span style={{ fontSize: font.sm, color: "var(--text-secondary)" }}>
          {periodLabel(data.period)}
        </span>
      </div>

      {/* Pending validation banner */}
      <ValidationBanner data={data.pending_validation} />

      {/* Tabs */}
      <DashboardTabs cards={cards} activeIdx={safeIdx} goTo={goTo} />

      {/* Content */}
      <div role="tabpanel" id={`dashboard-panel-${safeIdx}`} aria-live="polite">
        {cards[safeIdx].render()}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <DashboardWidget />
  </AppProvider>,
);
