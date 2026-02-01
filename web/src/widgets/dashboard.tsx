import { createRoot } from "react-dom/client";
import { useState, useCallback, useRef } from "react";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";
import { Sparkline, BarChart, HorizontalBars } from "./shared/charts.js";

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
}

// ── Card wrapper ──

function Card({ title, icon, children, fullWidth }: { title: string; icon: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        width: fullWidth ? "100%" : undefined,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {title}
        </span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ── Individual KPI Cards ──

function StreakCard({ data, fullWidth }: { data: DashboardData["streak"]; fullWidth?: boolean }) {
  if (!data) return null;
  const { current_weeks, longest_weeks, this_week } = data;
  return (
    <Card title="Training Streak" icon="🔥" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="stat-value">{current_weeks}</span>
        <span className="stat-label">weeks</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
        {this_week > 0
          ? `${this_week} session${this_week > 1 ? "s" : ""} this week`
          : "No sessions this week yet"}
      </div>
      {longest_weeks > current_weeks && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, opacity: 0.7 }}>
          Best: {longest_weeks} weeks
        </div>
      )}
    </Card>
  );
}

function VolumeCard({ data, fullWidth }: { data: DashboardData["volume_weekly"]; fullWidth?: boolean }) {
  if (!data || data.length === 0) {
    return (
      <Card title="Weekly Volume" icon="🏋️" fullWidth={fullWidth}>
        <div className="empty" style={{ padding: 12 }}>No volume data yet</div>
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
    <Card title="Weekly Volume" icon="🏋️" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span className="stat-value">{formatLargeNumber(last.volume)}</span>
        <span className="stat-label">kg</span>
        {prev && diff !== 0 && (
          <span
            className={`badge ${diff > 0 ? "badge-success" : "badge-danger"}`}
            style={{ fontSize: 11, marginLeft: 4 }}
          >
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
  if (!data || data.weekly.length === 0) {
    return (
      <Card title="Frequency" icon="📅" fullWidth={fullWidth}>
        <div className="empty" style={{ padding: 12 }}>No sessions yet</div>
      </Card>
    );
  }
  return (
    <Card title="Frequency" icon="📅" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span className="stat-value">{data.avg_per_week}</span>
        <span className="stat-label">sessions / week</span>
      </div>
      <Sparkline
        data={data.weekly.map((w) => w.count)}
        width={fullWidth ? 320 : 200}
        height={45}
      />
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
        {data.total} total sessions
      </div>
    </Card>
  );
}

function PRsCard({ data, fullWidth }: { data: DashboardData["recent_prs"]; fullWidth?: boolean }) {
  if (!data || data.length === 0) {
    return (
      <Card title="Recent PRs" icon="🏆" fullWidth={fullWidth}>
        <div className="empty" style={{ padding: 12 }}>No PRs yet</div>
      </Card>
    );
  }

  const typeLabel: Record<string, string> = {
    max_weight: "Weight",
    max_reps_at_weight: "Reps",
    estimated_1rm: "e1RM",
  };

  return (
    <Card title="Recent PRs" icon="🏆" fullWidth={fullWidth}>
      {data.map((pr, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "5px 0",
            borderBottom: i < data.length - 1 ? "1px solid var(--border)" : "none",
            fontSize: 13,
          }}
        >
          <div>
            <div style={{ fontWeight: 500 }}>{pr.exercise}</div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {typeLabel[pr.record_type] || pr.record_type}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, color: "var(--warning)" }}>{pr.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{pr.achieved_at}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}

function MuscleGroupCard({ data, fullWidth }: { data: DashboardData["muscle_groups"]; fullWidth?: boolean }) {
  if (!data || data.length === 0) {
    return (
      <Card title="Muscle Groups" icon="💪" fullWidth={fullWidth}>
        <div className="empty" style={{ padding: 12 }}>No data yet</div>
      </Card>
    );
  }
  return (
    <Card title="Muscle Groups" icon="💪" fullWidth={fullWidth}>
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
  if (!data || data.length === 0) return null;

  const first = data[0].value;
  const last = data[data.length - 1].value;
  const diff = last - first;

  return (
    <Card title="Body Weight" icon="⚖️" fullWidth={fullWidth}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span className="stat-value">{last.toFixed(1)}</span>
        <span className="stat-label">kg</span>
        {data.length > 1 && diff !== 0 && (
          <span
            className={`badge ${diff < 0 ? "badge-success" : "badge-warning"}`}
            style={{ fontSize: 11, marginLeft: 4 }}
          >
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
  if (!data || data.length === 0) {
    return (
      <Card title="Top Exercises" icon="⭐" fullWidth={fullWidth}>
        <div className="empty" style={{ padding: 12 }}>No data yet</div>
      </Card>
    );
  }
  return (
    <Card title="Top Exercises" icon="⭐" fullWidth={fullWidth}>
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

// ── Swipe Carousel ──

function SwipeCarousel({ children, count }: { children: (idx: number) => React.ReactNode; count: number }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);

  const goTo = useCallback(
    (idx: number) => setActiveIdx(Math.max(0, Math.min(idx, count - 1))),
    [count],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      const dy = e.changedTouches[0].clientY - touchRef.current.startY;
      touchRef.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        goTo(activeIdx + (dx < 0 ? 1 : -1));
      }
    },
    [activeIdx, goTo],
  );

  return (
    <div>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ display: "grid", gridTemplateColumns: "1fr" }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              gridArea: "1 / 1",
              visibility: i === activeIdx ? "visible" : "hidden",
            }}
            aria-hidden={i !== activeIdx}
          >
            {children(i)}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {Array.from({ length: count }, (_, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === activeIdx ? "var(--primary)" : "var(--border)",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Widget ──

function DashboardWidget() {
  const data = useToolOutput<DashboardData>();

  if (!data) return <div className="loading">Loading...</div>;

  // Build list of available cards
  const cards: Array<{ key: string; render: (fullWidth: boolean) => React.ReactNode }> = [];

  if (data.streak) cards.push({ key: "streak", render: (fw) => <StreakCard data={data.streak} fullWidth={fw} /> });
  if (data.volume_weekly) cards.push({ key: "volume", render: (fw) => <VolumeCard data={data.volume_weekly} fullWidth={fw} /> });
  if (data.frequency) cards.push({ key: "frequency", render: (fw) => <FrequencyCard data={data.frequency} fullWidth={fw} /> });
  if (data.recent_prs) cards.push({ key: "prs", render: (fw) => <PRsCard data={data.recent_prs} fullWidth={fw} /> });
  if (data.muscle_groups) cards.push({ key: "muscle_groups", render: (fw) => <MuscleGroupCard data={data.muscle_groups} fullWidth={fw} /> });
  if (data.body_weight) cards.push({ key: "body_weight", render: (fw) => <BodyWeightCard data={data.body_weight} fullWidth={fw} /> });
  if (data.top_exercises) cards.push({ key: "top_exercises", render: (fw) => <TopExercisesCard data={data.top_exercises} fullWidth={fw} /> });

  if (cards.length === 0) {
    return <div className="empty">No training data yet. Start logging workouts to see your dashboard!</div>;
  }

  // Single metric → show full width, no carousel
  if (data.metric && cards.length === 1) {
    return <div style={{ maxWidth: 400 }}>{cards[0].render(true)}</div>;
  }

  // Multiple cards → carousel
  return (
    <div style={{ maxWidth: 400 }}>
      <SwipeCarousel count={cards.length}>
        {(idx) => cards[idx].render(true)}
      </SwipeCarousel>
    </div>
  );
}

// ── Helpers ──

function formatLargeNumber(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v % 1 === 0 ? v.toString() : v.toFixed(1);
}

createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <DashboardWidget />
  </AppProvider>,
);
