import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";

// Sample tool output data for each widget
const sampleData: Record<string, { content: Array<{ type: string; text: string }> }> = {
  profile: {
    content: [{ type: "text", text: JSON.stringify({
      profile: {
        name: "Francisco", gym: "SmartFit", age: 28, weight_kg: 82,
        height_cm: 178, training_days_per_week: 5,
        experience_level: "intermediate",
        goals: ["hypertrophy", "strength"],
        injuries: ["lower back"],
        preferred_units: "metric",
        supplements: "creatine, whey protein",
      },
    })}],
  },
  session: {
    content: [{ type: "text", text: JSON.stringify({
      active: true, duration_minutes: 45,
      exercises: [
        { name: "Bench Press", sets: [{ reps: 10, weight: 80 }, { reps: 8, weight: 85 }] },
        { name: "Incline DB Press", sets: [{ reps: 12, weight: 30 }] },
        { name: "Cable Flyes", sets: [{ reps: 15, weight: 15 }] },
      ],
    })}],
  },
  stats: {
    content: [{ type: "text", text: JSON.stringify({
      exercise: "Bench Press",
      personal_records: { max_weight: { value: "100kg" }, estimated_1rm: { value: "110kg" } },
      frequency: { sessions_per_week: 2.5, total_sessions: 48 },
      progression: [
        { date: "2025-01-01", weight: 80, reps: 10, estimated_1rm: 106.7 },
        { date: "2025-01-08", weight: 82.5, reps: 9, estimated_1rm: 107.3 },
        { date: "2025-01-15", weight: 85, reps: 8, estimated_1rm: 107.7 },
        { date: "2025-01-22", weight: 87.5, reps: 7, estimated_1rm: 107.9 },
      ],
    })}],
  },
  "today-plan": {
    content: [{ type: "text", text: JSON.stringify({
      day: "Push Day", program: "PPL",
      exercises: [
        { name: "Bench Press", target_sets: 4, target_reps: "8-10", target_weight: 85, target_rpe: 8 },
        { name: "OHP", target_sets: 3, target_reps: "8-10", target_weight: 50 },
        { name: "Incline DB Press", target_sets: 3, target_reps: "10-12", notes: "Slow eccentric" },
      ],
      last_workout: {
        date: "2025-01-20",
        exercises: [
          { name: "Bench Press", sets: [{ reps: 10, weight: 82.5 }, { reps: 9, weight: 85 }] },
        ],
      },
    })}],
  },
  exercises: {
    content: [{ type: "text", text: JSON.stringify({
      exercises: [
        { name: "Bench Press", muscle_group: "chest", equipment: "barbell" },
        { name: "Squat", muscle_group: "legs", equipment: "barbell" },
      ],
      total: 2,
    })}],
  },
  programs: {
    content: [{ type: "text", text: JSON.stringify({
      programs: [{ name: "PPL", is_active: true, days: ["Push", "Pull", "Legs"] }],
    })}],
  },
  templates: {
    content: [{ type: "text", text: JSON.stringify({
      templates: [{ name: "Quick Upper", exercises: 4 }],
    })}],
  },
  measurements: {
    content: [{ type: "text", text: JSON.stringify({
      measurements: [{ type: "weight_kg", value: 82, date: "2025-01-28" }],
    })}],
  },
  export: {
    content: [{ type: "text", text: JSON.stringify({
      format: "json", scope: "all",
      data: { sessions: 48, exercises: 16, programs: 1 },
    })}],
  },
};

const logEl = document.getElementById("log") as HTMLPreElement;
const frame = document.getElementById("widget-frame") as HTMLIFrameElement;

let currentTheme: "light" | "dark" = "light";
let currentWidget = "profile";
let currentBridge: AppBridge | null = null;

function log(label: string, data?: unknown) {
  const time = new Date().toLocaleTimeString();
  const text = data ? JSON.stringify(data, null, 2).slice(0, 500) : "";
  logEl.textContent += `[${time}] ${label}\n${text}\n\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function getHostContext() {
  const darkVars = {
    "--color-background-primary": "#1a1a1a",
    "--color-background-secondary": "#2a2a2a",
    "--color-text-primary": "#e5e5e5",
    "--color-text-secondary": "#a0a0a0",
    "--color-border-primary": "#3a3a3a",
  };
  const lightVars = {
    "--color-background-primary": "#ffffff",
    "--color-background-secondary": "#f5f5f5",
    "--color-text-primary": "#1a1a1a",
    "--color-text-secondary": "#666666",
    "--color-border-primary": "#e0e0e0",
  };
  return {
    theme: currentTheme as string,
    styles: { variables: currentTheme === "dark" ? darkVars : lightVars },
  };
}

async function connectBridge() {
  // Clean up previous bridge
  if (currentBridge) {
    try { await currentBridge.close(); } catch { /* ignore */ }
    currentBridge = null;
  }

  const bridge = new AppBridge(
    null, // no MCP client — we provide data manually
    { name: "TestHost", version: "1.0.0" },
    { openLinks: {}, serverTools: {}, logging: {} },
    { hostContext: getHostContext() },
  );

  bridge.oninitialized = () => {
    log("Widget initialized, sending tool data...");
    const data = sampleData[currentWidget];
    // sendToolInput with empty args, then sendToolResult with the actual data
    bridge.sendToolInput({ arguments: {} });
    bridge.sendToolResult(data);
    log("Sent tool-input + tool-result", data);
  };

  bridge.onsizechange = ({ width, height }) => {
    if (height != null) {
      frame.style.height = `${Math.min(height + 40, 800)}px`;
    }
    if (width != null) {
      frame.style.width = `${width}px`;
    }
  };

  bridge.onloggingmessage = ({ level, logger, data }) => {
    log(`[${logger ?? "Widget"}] ${level}`, data);
  };

  currentBridge = bridge;

  // Wait for iframe to load before connecting transport
  frame.addEventListener("load", async () => {
    if (!frame.contentWindow) return;
    const transport = new PostMessageTransport(
      frame.contentWindow,
      frame.contentWindow,
    );
    try {
      await bridge.connect(transport);
      log("Bridge connected via PostMessageTransport");
    } catch (err) {
      log("Bridge connect error", err instanceof Error ? err.message : err);
    }
  }, { once: true });
}

// Expose functions to the HTML buttons
(window as any).loadWidget = async function loadWidget(name: string, btn?: HTMLButtonElement) {
  currentWidget = name;
  document.querySelectorAll(".controls button").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  logEl.textContent = `// Loading ${name} widget...\n`;

  await connectBridge();
  frame.src = `/dist/${name}.html`;
};

(window as any).toggleTheme = async function toggleTheme() {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  document.getElementById("theme-label")!.textContent = `Theme: ${currentTheme}`;
  document.body.style.background = currentTheme === "dark" ? "#111" : "#f5f5f5";
  document.body.style.color = currentTheme === "dark" ? "#eee" : "#000";

  // Reload widget with new theme (AppProvider reads context at init only)
  (window as any).loadWidget(currentWidget);
};

// Load profile widget on startup
(window as any).loadWidget("profile");
