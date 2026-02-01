import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Widget name → MCP tool call to fetch initial data
const WIDGET_TOOLS: Record<string, { tool: string; args: Record<string, unknown> }> = {
  profile: { tool: "show_profile", args: {} },
  session: { tool: "get_active_session", args: {} },
  stats: { tool: "get_stats", args: { exercise: "Bench Press", period: "3m" } },
  "today-plan": { tool: "get_today_plan", args: {} },
  exercises: { tool: "manage_exercises", args: { action: "list" } },
  programs: { tool: "show_program", args: {} },
  templates: { tool: "manage_templates", args: { action: "list" } },
  measurements: { tool: "manage_body_measurements", args: { action: "latest" } },
  "programs-list": { tool: "show_programs", args: {} },
  export: { tool: "export_data", args: { format: "json", scope: "all" } },
};

// Sample data fallback when server is not running
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
      program: {
        name: "Push Pull Legs", description: "6-day PPL split for hypertrophy", version: 2,
        days: [
          { day_label: "Push A", weekdays: [1, 4], exercises: [
            { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: 85, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest" },
            { exercise_name: "Overhead Press", target_sets: 3, target_reps: 10, target_weight: 50, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "shoulders" },
            { exercise_name: "Cable Fly", target_sets: 3, target_reps: 12, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "chest" },
            { exercise_name: "Lateral Raise", target_sets: 3, target_reps: 15, target_weight: 12, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders" },
            { exercise_name: "Tricep Pushdown", target_sets: 3, target_reps: 12, target_weight: 25, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: "Rope attachment", muscle_group: "triceps" },
          ]},
        ],
      },
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
  "programs-list": {
    content: [{ type: "text", text: JSON.stringify({
      profile: { experience_level: "intermediate", training_days_per_week: 4 },
      programs: [
        { id: 1, name: "Upper/Lower 4x", is_active: true, description: "4 days/week upper/lower split", version: 2, days: [
          { day_label: "Upper A", weekdays: [1], exercises: [
            { exercise_name: "Bench Press", target_sets: 4, target_reps: 8, target_weight: 80, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
            { exercise_name: "Barbell Row", target_sets: 4, target_reps: 8, target_weight: 70, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Lateral Raise", target_sets: 3, target_reps: 15, target_weight: 10, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            { exercise_name: "Face Pull", target_sets: 3, target_reps: 15, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "shoulders", rep_type: "reps" },
          ]},
          { day_label: "Lower A", weekdays: [2], exercises: [
            { exercise_name: "Squat", target_sets: 4, target_reps: 6, target_weight: 100, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Romanian Deadlift", target_sets: 3, target_reps: 10, target_weight: 80, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Leg Curl", target_sets: 3, target_reps: 12, target_weight: 40, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: null, muscle_group: "legs", rep_type: "reps" },
          ]},
          { day_label: "Upper B", weekdays: [4], exercises: [
            { exercise_name: "Overhead Press", target_sets: 4, target_reps: 6, target_weight: 50, target_rpe: 8, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            { exercise_name: "Pull-Up", target_sets: 4, target_reps: 8, target_weight: null, target_rpe: 7, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Tricep Pushdown", target_sets: 3, target_reps: 12, target_weight: 25, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "arms", rep_type: "reps" },
            { exercise_name: "Bicep Curl", target_sets: 3, target_reps: 12, target_weight: 15, target_rpe: null, superset_group: 1, group_type: "superset", rest_seconds: 60, notes: null, muscle_group: "arms", rep_type: "reps" },
          ]},
          { day_label: "Lower B", weekdays: [5], exercises: [
            { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: 120, target_rpe: 9, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
            { exercise_name: "Leg Press", target_sets: 3, target_reps: 10, target_weight: 150, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "legs", rep_type: "reps" },
            { exercise_name: "Calf Raise", target_sets: 4, target_reps: 15, target_weight: 60, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 60, notes: null, muscle_group: "legs", rep_type: "reps" },
          ]},
        ]},
      ],
      globalPrograms: [
        { id: 100, name: "Full Body 3x", description: "3 days/week full body routine.", version: 1, days_per_week: 3,
          days: [
            { day_label: "Full Body A", weekdays: [1], exercises: [
              { exercise_name: "Squat", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Bench Press", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Barbell Row", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Full Body B", weekdays: [3], exercises: [
              { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Incline Bench Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
            ]},
            { day_label: "Full Body C", weekdays: [5], exercises: [
              { exercise_name: "Leg Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Bench Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
            ]},
          ]},
        { id: 101, name: "Upper/Lower 4x", description: "4 days/week upper/lower split.", version: 1, days_per_week: 4,
          days: [
            { day_label: "Upper A", weekdays: [1], exercises: [
              { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Barbell Row", target_sets: 4, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Lower A", weekdays: [2], exercises: [
              { exercise_name: "Squat", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Romanian Deadlift", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "hamstrings", rep_type: "reps" },
            ]},
            { day_label: "Upper B", weekdays: [4], exercises: [
              { exercise_name: "Overhead Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "shoulders", rep_type: "reps" },
              { exercise_name: "Pull-Up", target_sets: 4, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Lower B", weekdays: [5], exercises: [
              { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Squat", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "quads", rep_type: "reps" },
            ]},
          ]},
        { id: 102, name: "Push Pull Legs 6x", description: "6 days/week PPL split.", version: 1, days_per_week: 6,
          days: [
            { day_label: "Push A", weekdays: [1], exercises: [
              { exercise_name: "Bench Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "chest", rep_type: "reps" },
              { exercise_name: "Overhead Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "shoulders", rep_type: "reps" },
            ]},
            { day_label: "Pull A", weekdays: [2], exercises: [
              { exercise_name: "Barbell Row", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Pull-Up", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Legs A", weekdays: [3], exercises: [
              { exercise_name: "Squat", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "quads", rep_type: "reps" },
              { exercise_name: "Romanian Deadlift", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "hamstrings", rep_type: "reps" },
            ]},
            { day_label: "Push B", weekdays: [4], exercises: [
              { exercise_name: "Overhead Press", target_sets: 4, target_reps: 6, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "shoulders", rep_type: "reps" },
              { exercise_name: "Bench Press", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "chest", rep_type: "reps" },
            ]},
            { day_label: "Pull B", weekdays: [5], exercises: [
              { exercise_name: "Deadlift", target_sets: 3, target_reps: 5, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Barbell Row", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 90, notes: null, muscle_group: "back", rep_type: "reps" },
            ]},
            { day_label: "Legs B", weekdays: [6], exercises: [
              { exercise_name: "Deadlift", target_sets: 3, target_reps: 8, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 180, notes: null, muscle_group: "back", rep_type: "reps" },
              { exercise_name: "Squat", target_sets: 3, target_reps: 10, target_weight: null, target_rpe: null, superset_group: null, group_type: null, rest_seconds: 120, notes: null, muscle_group: "quads", rep_type: "reps" },
            ]},
          ]},
      ],
    })}],
  },
  export: {
    content: [{ type: "text", text: JSON.stringify({
      format: "json", scope: "all",
      data: { sessions: 48, exercises: 16, programs: 1 },
    })}],
  },
};

const MCP_SERVER_URL = "http://localhost:3001/mcp";

const logEl = document.getElementById("log") as HTMLPreElement;
const frame = document.getElementById("widget-frame") as HTMLIFrameElement;
const modeLabel = document.getElementById("mode-label") as HTMLSpanElement;

let currentTheme: "light" | "dark" = "light";
let currentWidget = "profile";
let currentBridge: AppBridge | null = null;
let mcpClient: Client | null = null;
let isLiveMode = false;

function log(label: string, data?: unknown) {
  const time = new Date().toLocaleTimeString();
  const text = data ? JSON.stringify(data, null, 2).slice(0, 500) : "";
  logEl.textContent += `[${time}] ${label}\n${text}\n\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function updateModeLabel() {
  if (modeLabel) {
    modeLabel.textContent = isLiveMode ? "LIVE (dev DB)" : "Sample data";
    modeLabel.style.color = isLiveMode ? "#16a34a" : "#f59e0b";
  }
}

async function connectMcpClient(): Promise<Client | null> {
  try {
    const client = new Client({ name: "TestHost", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    await client.connect(transport);
    log("MCP client connected to " + MCP_SERVER_URL);
    return client;
  } catch (err) {
    log("MCP server not available, using sample data", err instanceof Error ? err.message : err);
    return null;
  }
}

async function callToolViaClient(client: Client, toolName: string, args: Record<string, unknown>): Promise<any> {
  log(`Calling tool: ${toolName}`, args);
  const result = await client.callTool({ name: toolName, arguments: args });
  log(`Tool result received`, result);
  return result;
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

  // Try to connect MCP client if not already connected
  if (!mcpClient) {
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    updateModeLabel();
  }

  const bridge = new AppBridge(
    mcpClient, // real client for auto-forwarding tool calls, or null for sample data
    { name: "TestHost", version: "1.0.0" },
    { openLinks: {}, serverTools: {}, logging: {} },
    { hostContext: getHostContext() },
  );

  bridge.oninitialized = async () => {
    log("Widget initialized, fetching data...");

    let data: any;
    if (mcpClient && WIDGET_TOOLS[currentWidget]) {
      // Live mode: call actual MCP tool
      try {
        const { tool, args } = WIDGET_TOOLS[currentWidget];
        data = await callToolViaClient(mcpClient, tool, args);
      } catch (err) {
        log("Tool call failed, falling back to sample data", err instanceof Error ? err.message : err);
        data = sampleData[currentWidget];
      }
    } else {
      // Sample data mode
      data = sampleData[currentWidget];
    }

    bridge.sendToolInput({ arguments: {} });
    bridge.sendToolResult(data);
    log("Data sent to widget", { mode: isLiveMode ? "live" : "sample" });
  };

  bridge.onsizechange = ({ height }) => {
    if (height != null) {
      frame.style.height = `${Math.min(height + 40, 800)}px`;
    }
    // Don't override width — keep iframe at CSS 100% so widgets can be responsive
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

(window as any).toggleMode = async function toggleMode() {
  if (isLiveMode) {
    // Switch to sample data
    if (mcpClient) {
      try { await mcpClient.close(); } catch { /* ignore */ }
      mcpClient = null;
    }
    isLiveMode = false;
  } else {
    // Try to connect to live server
    mcpClient = await connectMcpClient();
    isLiveMode = mcpClient !== null;
    if (!isLiveMode) {
      log("Cannot switch to live mode — server not available");
    }
  }
  updateModeLabel();
  // Reload current widget
  (window as any).loadWidget(currentWidget);
};

// Load profile widget on startup
(window as any).loadWidget("profile");
