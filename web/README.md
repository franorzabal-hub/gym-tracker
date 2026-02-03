# MCP Apps Widgets

HTML widgets rendered by MCP hosts (Claude Desktop, claude.ai, VS Code, ChatGPT). Powered by `@modelcontextprotocol/ext-apps` and its official React hooks (`/react` subpath).

## Widget interaction philosophy

**The LLM is the editor; the widget is the reviewer.** Display widgets (`show_*`) are read-only cards — they show data but don't have inline editing (no inputs, no toggles, no auto-save). When the user wants to change something, they say it in conversation → the LLM interprets and calls the display tool with a `pending_changes` param → the widget shows a visual diff (old value strikethrough → new value in accent color) with a single "Confirm" button → the user clicks to apply or rejects by saying "no" in chat.

**Why:** Inline editing in widgets creates a parallel edit path that competes with the LLM. The user ends up confused about whether to edit in the widget or talk to the LLM. With this approach, all editing goes through conversation, and the widget is purely for review and confirmation.

**Pending changes flow:**
1. `show_profile()` with no params → read-only card
2. `show_profile({ pending_changes: { weight_kg: 85, gym: "Iron Paradise" } })` → card with diff highlights + "Confirm" button
3. User clicks "Confirm" → widget calls `manage_profile({ action: "update", data: pendingChanges })` via `useCallTool()` → merges into local state, shows "Updated" flash
4. User says "no" in chat → nothing happens, changes never applied

**Applied to:** `show_profile` (done). Planned for `show_program`, `show_programs` in future iterations.

**Pending changes pattern — server side:**
- Add `pending_changes: z.record(z.any()).optional()` to tool inputSchema
- Set `readOnlyHint: false` (widget can trigger writes via confirm)
- Include `pendingChanges` in `structuredContent` only when non-empty
- LLM note: with pending → "Wait for user to confirm"; without → "Do NOT repeat"

**Pending changes pattern — widget side:**
- Reusable components: `DiffValue` (scalar diff: ~~old~~ → **new**), `DiffChips` (array set diff: unchanged + removed + added), `ConfirmBar` (button with saving/confirmed states)
- CSS classes in `styles.css`: `.diff-old` (strikethrough), `.diff-new` (accent color), `.diff-chip-added` (green dashed), `.diff-chip-removed` (red strikethrough), `.skeleton` (loading pulse)
- Widget states: loading (skeleton) → read-only → diff view + confirm bar → confirming (disabled button) → confirmed (flash + merge into local state)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ MCP Host (Claude Desktop / claude.ai)                           │
│  1. Calls tool → server returns JSON data                       │
│  2. Reads _meta.ui.resourceUri → fetches widget HTML resource   │
│  3. Renders widget HTML in sandboxed iframe                     │
│  4. Widget iframe ↔ Host communicate via postMessage (JSON-RPC) │
│     - ui/initialize handshake (handled by SDK's useApp hook)    │
│     - ui/notifications/tool-result delivers tool data to widget │
│     - Auto-resize via ResizeObserver (enabled by default)       │
│  5. Host injects CSS variables + color-scheme for theming       │
└─────────────────────────────────────────────────────────────────┘
```

## Two npm projects

| Directory | Purpose | Key packages |
|---|---|---|
| `/` (root) | MCP server — registers tools + widget resources | `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps/server` |
| `web/` | Widget UI — React apps compiled to single HTML files | `@modelcontextprotocol/ext-apps/react`, React, Vite |

**CRITICAL:** Both projects use `@modelcontextprotocol/ext-apps` but different entry points. The **root** uses `/server` (for `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`). The **web** uses `/react` (for `useApp`, `useHostStyles`, `useDocumentTheme` hooks). Versions must stay compatible — both need `^1.0.0`.

## Server side — Registering tools with widgets

Each tool uses `registerAppToolWithMeta()` (wrapper around `registerAppTool` from ext-apps/server). The `_meta.ui.resourceUri` field links the tool to its widget resource:

```typescript
// src/tools/profile.ts
registerAppToolWithMeta(server, "manage_profile", {
  title: "Manage Profile",
  description: "...",
  inputSchema: { action: z.enum(["get", "update"]), data: z.record(z.any()).optional() },
  annotations: {},
  _meta: {
    ui: { resourceUri: "ui://gym-tracker/profile.html" },
  },
}, async ({ action, data }) => { /* handler returns toolResponse({...}) */ });
```

**No capability negotiation needed.** The server creates a new `McpServer` per request (stateless). Non-UI hosts simply ignore `_meta.ui` fields. No server-side feature detection is required.

Widget resources are registered in `src/resources/register-widgets.ts` using `registerAppResource()`. Each resource maps a `ui://gym-tracker/*.html` URI to a built HTML file in `web/dist/`. The mime type must be `text/html;profile=mcp-app` (use `RESOURCE_MIME_TYPE` constant).

**Dual registration (MCP + OpenAI):** Each widget is registered twice — once for standard MCP hosts (`ui://gym-tracker/`) with `RESOURCE_MIME_TYPE`, and once for OpenAI/ChatGPT (`ui://gym-tracker-oai/`) with `text/html+skybridge` MIME type. Both point to the same built HTML files.

## Directory structure

```
web/
  package.json               # Separate npm project (npm install must run here too)
  vite.config.ts             # Vite + react + vite-plugin-singlefile
  build.sh                   # Loops over *.html, builds each widget separately
  *.html                     # Entry points (profile.html, session.html, etc.)
  test-host.html             # Dev-only: test host page served via `npx vite`
  dist/                      # Built output — single self-contained HTML files
  src/
    app-context.tsx           # AppProvider: useApp + useHostStyles + toolOutput context
    hooks.ts                 # React hooks: useToolOutput(), useCallTool(), useTheme()
    styles.css               # Shared styles with host CSS variable aliases
    test-host.ts             # Widget test host: AppBridge + MCP client, HMR, device presets, all 21 tools
    widgets/                 # One React component per widget (profile.tsx, etc.)
      shared/              # Shared components: charts.tsx, exercise-icons.tsx, program-view.tsx, diff-components.tsx
```

**Build pipeline:** `cd web && npm run build` → runs `build.sh` → loops over each `*.html` entry point → Vite builds each with `vite-plugin-singlefile` (inlines all JS/CSS into a single HTML) → output to `web/dist/`.

**Build after every widget change.** The server serves files from `web/dist/`, not source.

## AppProvider + app-context.tsx

All widgets are wrapped in `<AppProvider>`, which handles the SDK connection lifecycle:

1. `useApp()` — creates the `App` instance, connects via `PostMessageTransport`, returns `{ app, isConnected, error }`
2. `onAppCreated` callback — registers `app.ontoolresult` to parse tool data into React state
3. `useHostStyles(app)` — injects host CSS variables + fonts into the document automatically
4. Exposes `app`, `isConnected`, `error`, `toolOutput` via React context

The `hooks.ts` module provides convenience hooks that read from this context:
- `useToolOutput<T>()` — returns parsed tool result JSON (or `null` while loading)
- `useCallTool()` — returns `{ callTool(name, args), loading, error }` using `app.callServerTool()`
- `useTheme()` — re-exports `useDocumentTheme()` from SDK (returns `"light"` | `"dark"`)

## CSS theming approach

`styles.css` defines shorthand aliases that map to official host CSS variables with fallbacks:

```css
:root {
  --bg: var(--color-background-primary, #ffffff);
  --text: var(--color-text-primary, #1a1a1a);
  --border: var(--color-border-primary, #e0e0e0);
  --primary: var(--color-text-info, #2563eb);
  --radius: var(--border-radius-md, 8px);
  --font: var(--font-sans, -apple-system, ...);
  /* etc. */
}
```

- The host injects `--color-background-primary`, `--color-text-primary`, `--font-sans`, etc. via `useHostStyles()`
- Variable names must match the SDK's `McpUiHostStylesSchema` — only predefined keys are accepted (no custom names)
- When running outside a host (dev mode), fallback values apply
- Dark mode is automatic: `useHostStyles()` sets `color-scheme` on the document, and badge colors use `light-dark()` CSS function
- No `.dark` class toggle needed — widgets don't manage theme state

## Widget component pattern

**Read-only widget (basic):**
```tsx
function ExampleWidget() {
  const data = useToolOutput();
  if (!data) return <SkeletonCard />;   // Pulsing placeholder, not "Loading..." text
  return <div>...</div>;
}
```

**Widget with pending changes (confirm flow):**
```tsx
function ExampleWidget() {
  const data = useToolOutput<{ profile: Record<string, any>; pendingChanges?: Record<string, any> }>();
  const { callTool } = useCallTool();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [localData, setLocalData] = useState(null);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    await callTool("manage_profile", { action: "update", data: data.pendingChanges });
    setLocalData(prev => ({ ...prev, ...data.pendingChanges }));
    setConfirming(false);
    setConfirmed(true);
  }, [data, callTool]);

  if (!data) return <SkeletonCard />;
  const hasPending = !!data.pendingChanges && Object.keys(data.pendingChanges).length > 0;
  // Render read-only card, with DiffValue/DiffChips where fields changed
  // Show <ConfirmBar> only when hasPending
}
```

All widgets wrap root render in `<AppProvider>`:
```tsx
createRoot(document.getElementById("root")!).render(
  <AppProvider><ExampleWidget /></AppProvider>
);
```

## Adding a new widget

1. Create `web/src/widgets/foo.tsx` with the React component
2. Wrap the root render in `<AppProvider>`: `<AppProvider><FooWidget /></AppProvider>`
3. Create `web/foo.html` entry point (minimal HTML with `<div id="root">` + `<script type="module" src="/src/widgets/foo.tsx">`)
4. Add to `WIDGETS` array in `src/resources/register-widgets.ts` with name, URI (`ui://gym-tracker/foo.html`), file, description
5. In the tool file, use `registerAppToolWithMeta` with `_meta: { ui: { resourceUri: "ui://gym-tracker/foo.html" } }`
6. Add to `WIDGET_TOOLS` in `web/src/test-host.ts` with the tool name, default args, and type (`"ui"` for display tools, `"data"` for data tools with widgets). Also add sample data in `sampleData` for offline testing.
7. Build: `cd web && npm run build`

## Local development

See the root CLAUDE.md "Local Development Setup" section for server startup and database management.

For Claude Desktop widget testing:
1. Server must be running: `DEV_USER_ID=1 npm run dev`
2. Start the permanent Cloudflare tunnel: `cloudflared tunnel --protocol http2 run gym-tracker`
   - Tunnel config: `~/.cloudflared/config.yml` → `gym-tracker.1kairos.com` → `http://localhost:3001`
   - **Must use `--protocol http2`** — QUIC is blocked on some networks
3. In Claude Desktop, connector URL: `https://gym-tracker.1kairos.com/mcp`
4. After widget code changes: `cd web && npm run build`, then start a new conversation in Claude Desktop

**Widget test host** (no Claude Desktop needed): `cd web && npm run dev:host` → opens http://localhost:5173/test-host.html. This is the primary tool for widget development.

Features:
- **HMR**: Edit any `.tsx` widget file → change appears instantly (no rebuild, no restart)
- **Live mode**: When the MCP server is running (`DEV_USER_ID=1 npm run dev`), widgets load real data from the dev database via Vite proxy (`/mcp` → `localhost:3001`)
- **Sample mode**: Works without the MCP server using hardcoded sample data (fallback)
- **All 21 tools**: Sidebar lists every MCP tool in 3 groups — Display (UI), Data (Widget), Data Only (JSON). Data-only tools render raw JSON response in the iframe.
- **Device presets**: Responsive, iPhone SE, iPhone Pro, iPad, Desktop — test layout at different sizes
- **Theme toggle**: Switch light/dark to test widget theming
- **Connection status**: Green/red dot shows if MCP server is reachable

The test host registry is in `web/src/test-host.ts` (`WIDGET_TOOLS` + `sampleData`). When adding a new tool or changing tool args, update both.

**Important**: `vite-plugin-singlefile` is disabled in dev mode (it breaks HMR). It only runs during `npm run build`. The `vite.config.ts` conditionally applies it based on `command === "build"`.

## How the postMessage protocol works (for debugging)

The SDK handles this automatically via `useApp()`. The sequence:
1. SDK creates `PostMessageTransport(window.parent, window.parent)`
2. Sends `ui/initialize` JSON-RPC request via `window.parent.postMessage(data, "*")`
3. Host responds with `ui/initialize` result (protocolVersion, hostInfo, hostCapabilities, hostContext with theme + styles)
4. SDK sends `ui/notifications/initialized` notification
5. Host sends `ui/notifications/tool-result` → `app.ontoolresult` fires → `useToolOutput()` updates → React re-renders
6. SDK auto-reports size changes via `ResizeObserver` (enabled by default in `useApp`)

If the widget shows "Loading..." forever, the protocol handshake failed. Common causes:
- Host doesn't respond to `ui/initialize` (check parent window message listeners)
- Tool result format mismatch (widget expects parsed JSON from `content[0].text`)
- SDK version mismatch between server and client

## Version compatibility

| Package | Where | Required version | Why |
|---|---|---|---|
| `@modelcontextprotocol/ext-apps` | `web/package.json` | `^1.0.0` | Provides `/react` hooks (`useApp`, `useHostStyles`, `useDocumentTheme`) |
| `@modelcontextprotocol/ext-apps/server` | root `package.json` | `^1.0.0` | Must match client version for `registerAppTool`/`registerAppResource` API compat |
| `@modelcontextprotocol/sdk` | root `package.json` | `^1.12.1` | Required by ext-apps as peer dependency |

After updating versions: `npm install` in both root and `web/`, then `cd web && npm run build`.

## Common pitfalls

- **Version mismatch**: `web/package.json` must have `@modelcontextprotocol/ext-apps: "^1.0.0"`. The `/react` subpath with `useApp()` hook requires v1.0+.
- **Missing AppProvider**: Every widget must wrap its root render in `<AppProvider>`. Without it, `useToolOutput()` and `useCallTool()` return null/no-op.
- **Forgot to rebuild**: Server serves `web/dist/*.html`. If you edit widget source but don't run `cd web && npm run build`, the old version is served.
- **Two npm installs**: Root and `web/` are separate npm projects. After cloning or updating deps, run `npm install` in BOTH directories.
- **CORS**: In dev, `getAllowedOrigins()` in server.ts allows localhost ports. For production, set `ALLOWED_ORIGINS` env var.
- **Dockerfile**: Must include a widget build stage (`cd web && npm ci && npm run build`) before the server stage.
- **Claude Desktop caching**: After rebuilding widgets, start a new conversation in Claude Desktop. It may cache the old MCP connection/resources from the previous conversation.
