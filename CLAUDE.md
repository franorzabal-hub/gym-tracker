# Gym Tracker — Project Context

MCP Server that turns Claude into a gym training partner. Users talk naturally in Spanish/English, Claude calls tools.

## Development Workflow

**IMPORTANT:** Follow this workflow in every session.

1. **Commit directly to main** — no branches, no PRs (solo developer)
2. **Run `npm test` before every commit** — TypeScript must compile (`tsc --noEmit`) and all tests must pass
3. **Push to main triggers CI only** — never deploys automatically
4. **Deploy only when explicitly asked** — never deploy on your own initiative
5. **After server-side code changes, always restart the dev server** — kill the running process and start a new one with `DEV_USER_ID=1 npm run dev`. The server loads code at startup; changes aren't reflected until restart.
6. **For widget development, use the test host** — `cd web && npm run dev:host`. Vite HMR applies changes instantly in the browser (no rebuild, no restart). Only run `cd web && npm run build` when preparing for Claude Desktop testing or production.
7. **Claude Desktop requires a new conversation** after server restart to pick up MCP changes (it caches the connection per conversation)

To deploy (only when the user asks):
```bash
gh workflow run "CI/CD" --field deploy=true
```

### Database isolation

| Environment | Neon branch | Where DATABASE_URL lives |
|---|---|---|
| Local dev | `dev` | `.env` (never committed) |
| Production | `main` | GitHub Secrets → Cloud Run |

Dev and prod databases are completely isolated. Local development cannot affect production data.

## CI/CD

`.github/workflows/deploy.yml` runs on push to main, PRs, and manual dispatch:
1. **check** (automatic): `npm ci` → `npx tsc --noEmit` → `npx vitest run` — runs on every push/PR
2. **deploy** (manual only): `gcloud run deploy` to Cloud Run — only via `workflow_dispatch`

## Deployment

| Service | Value |
|---|---|
| Cloud Run | `https://gym-tracker-680099996238.us-central1.run.app` |
| MCP Endpoint | `https://gym-tracker-680099996238.us-central1.run.app/mcp` |
| Neon Postgres | `autumn-rice-23097289` (aws-us-east-2) |
| GCP Project | `kairos-loyalty-api` |

### Cloud Run Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Yes |
| `WORKOS_API_KEY` | WorkOS AuthKit API key | Yes |
| `WORKOS_CLIENT_ID` | WorkOS client ID | Yes |
| `BASE_URL` | Public URL of the service (used for OAuth redirects) | Yes |
| `STATE_SECRET` | HMAC key for signing OAuth state (hex string). If unset, uses ephemeral random (resets on deploy). | Recommended |
| `REGISTRATION_SECRET` | Bearer token required for `POST /auth/register`. If unset, endpoint is open (dev mode). | Recommended |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins. Defaults to localhost in dev. | No |

Manage via: `gcloud run services update gym-tracker --region us-central1 --project kairos-loyalty-api --update-env-vars "KEY=value"`

## Local Development Setup

### Prerequisites
- Node.js 22
- Neon CLI: `brew install neonctl`

### First-time setup
1. `neon auth` (login to Neon)
2. `neon branches create --name dev --project-id autumn-rice-23097289`
3. `neon connection-string dev --project-id autumn-rice-23097289` → copy the URL
4. `cp .env.example .env` → paste the dev branch `DATABASE_URL`
5. `npm install && cd web && npm install`

### Daily workflow
1. `DEV_USER_ID=1 npm run dev` (server on port 3001, migrations auto-apply)
2. For widget development: `cd web && npm run dev:host` → opens http://localhost:5173/test-host.html with HMR
3. For production/Claude Desktop: `cd web && npm run build` (only needed when done iterating)

### Database management
- Dev branch is isolated from prod (copy-on-write)
- Reset dev DB: delete and recreate the branch
  ```
  neon branches delete dev --project-id autumn-rice-23097289
  neon branches create --name dev --project-id autumn-rice-23097289
  ```
  Then update `DATABASE_URL` in `.env` (new endpoint)
- Prod DB (Neon main branch) credentials only in GitHub Secrets + Cloud Run

## Stack

Node.js + TypeScript, Express, CORS, `@modelcontextprotocol/sdk` (StreamableHTTP), `@modelcontextprotocol/ext-apps` (MCP Apps widgets), PostgreSQL via `pg`, Zod, Vitest, WorkOS OAuth 2.1, JOSE, AsyncLocalStorage.

## Project Structure

```
server.ts                    # Express + MCP server + auth middleware
src/auth/                    # middleware.ts, oauth-routes.ts, workos.ts
src/context/user-context.ts  # AsyncLocalStorage: getUserId() / runWithUser()
src/db/                      # connection.ts, migrate.ts, run-migrations.ts, migrations/001-015
src/tools/                   # 16 files → 20 MCP tools (14 data + 6 display)
src/helpers/                 # exercise-resolver.ts, stats-calculator.ts, program-helpers.ts, log-exercise-helper.ts, date-helpers.ts, parse-helpers.ts, tool-response.ts
src/resources/               # register-widgets.ts — registers all widget resources
src/tools/__tests__/         # Vitest tests (1 per tool file)
web/                         # Widget UI (separate npm project, see "MCP Apps Widgets" section)
```

## Authentication & Multi-Tenancy

- WorkOS OAuth 2.1: `/auth/authorize` → `/auth/callback` → Bearer token
- PKCE S256 mandatory on `/authorize` (requires `code_challenge`) and `/token` (requires `code_verifier`)
- In-memory rate limiting per IP: 20/min on `/authorize` and `/token`, 5/min on `/register` (429 on excess). Timers use `.unref()`.
- OAuth state signed with HMAC-SHA256 (`STATE_SECRET` env var) + 10-min TTL. Falls back to ephemeral random secret.
- `/register` protected by `REGISTRATION_SECRET` env var (Bearer token). Unrestricted in dev when unset.
- `trust proxy` enabled (`app.set("trust proxy", 1)`) for correct `req.ip` behind Cloud Run.
- `authenticateToken()` middleware resolves Bearer → WorkOS user → `users` table (upsert)
- `runWithUser(userId, fn)` wraps each request in AsyncLocalStorage
- All tools call `getUserId()` to scope queries. All tables have `user_id` FK with per-user unique constraints.

## Database Schema

```
users (id, external_id UNIQUE, email, created_at, last_login)
user_profile (user_id FK UNIQUE, data JSONB)
exercises (user_id FK nullable, name, muscle_group, equipment, rep_type, exercise_type, description)
  → UNIQUE on (COALESCE(user_id, 0), LOWER(name)) — global (user_id NULL) + per-user
exercise_aliases (exercise_id FK, alias UNIQUE)
programs (user_id FK nullable, name, is_active) → program_versions → program_days → program_day_exercises
  → user_id NULL = global template program; user_id set = user-owned program
sessions (user_id FK, started_at, ended_at, tags TEXT[], deleted_at) → session_exercises → sets
personal_records (user_id FK, exercise_id FK, record_type) UNIQUE per user+exercise+type
pr_history (user_id FK, exercise_id FK, record_type, value, achieved_at)
session_templates (user_id FK, name UNIQUE per user) → session_template_exercises
body_measurements (user_id FK, measurement_type, value NUMERIC, measured_at, notes)
auth_tokens (token PK, workos_user_id, email, expires_at)
auth_codes (code PK, workos_user_id, email, expires_at, code_challenge, code_challenge_method)
dynamic_clients (client_id PK, redirect_uris TEXT[])
```

Key: per-set rows, program versioning, soft delete on sessions, GIN index on tags, `rep_type` (reps/seconds/meters/calories), `exercise_type` (strength/mobility/cardio/warmup — PRs only for strength). Auth tokens/codes persisted in Postgres with TTL cleanup every 15 min.

## MCP Tools (20)

### Data Tools (14) — return JSON, no UI

| Tool | Actions / Params |
|---|---|
| `get_onboarding_status` | MANDATORY first call. Returns user state + `required_next_tool` routing. New users → `show_profile`, then `show_programs` |
| `manage_profile` | get, update (JSONB) |
| `manage_exercises` | list, search, add, add_bulk, update, update_bulk, delete, delete_bulk |
| `manage_program` | list, get, create, clone, update, activate, delete, delete_bulk, history |
| `log_workout` | Unified: start session, log exercise(s), log routine day. Auto-creates session, infers program day, supports overrides/skip, single/bulk exercises, PR check. Replaces start_session + log_exercise + log_routine |
| `end_session` | notes?, force?, tags? — summary + comparison vs last |
| `get_active_session` | no params — returns active session with exercises or `{active: false}` |
| `get_today_plan` | no params — today's day + exercises + last workout (read-only, no session created) |
| `get_history` | period, exercise?, program_day?, tags? filter |
| `get_stats` | single (`exercise`) or multi (`exercises[]`), period — PRs, progression, volume, frequency |
| `edit_log` | update/delete sets, bulk[], delete_session, restore_session, delete_sessions[] |
| `manage_templates` | save, list, start, delete, delete_bulk |
| `manage_body_measurements` | log, history, latest — temporal tracking (weight_kg, body_fat_pct, chest_cm, etc.) |
| `export_data` | json or csv — scopes: all, sessions, exercises, programs, measurements, prs; period filter |

### Display Tools (6) — render visual widgets, LLM must NOT repeat data

| Tool | Widget | Description |
|---|---|---|
| `show_profile` | profile.html | Read-only profile card. Supports `pending_changes` param for LLM-proposed edits with visual diff + confirm button |
| `show_programs` | programs-list.html | Programs list with user's existing programs and global program templates. Users can activate programs, clone global programs, or choose custom |
| `show_available_programs` | available-programs.html | Browse global program templates with clone capability |
| `show_program` | programs.html | Program viewer with days, exercises, supersets, weights. Defaults to active program, optional `name` param |
| `show_dashboard` | dashboard.html | Training dashboard with KPIs, volume charts, streak, PRs, muscle group distribution |
| `show_workout` | workout.html | Interactive workout session editor. Optional `session_id` to view a specific (possibly ended) session in read-only mode. Without it, shows active session with inline-editable sets (reps, weight, RPE, type). Add/remove exercises and sets. |
| `show_workouts` | workouts.html | Workout history list with clickable session cards. Filters: period, exercise, program_day, tags, limit, offset. Each card opens `show_workout` with that session_id. |

## MCP Apps Widgets

HTML widgets rendered by MCP hosts (Claude Desktop, claude.ai, VS Code, ChatGPT). Powered by `@modelcontextprotocol/ext-apps` and its official React hooks (`/react` subpath).

### Widget interaction philosophy

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

### Architecture Overview

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

### Two npm projects

| Directory | Purpose | Key packages |
|---|---|---|
| `/` (root) | MCP server — registers tools + widget resources | `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps/server` |
| `web/` | Widget UI — React apps compiled to single HTML files | `@modelcontextprotocol/ext-apps/react`, React, Vite |

**CRITICAL:** Both projects use `@modelcontextprotocol/ext-apps` but different entry points. The **root** uses `/server` (for `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`). The **web** uses `/react` (for `useApp`, `useHostStyles`, `useDocumentTheme` hooks). Versions must stay compatible — both need `^1.0.0`.

### Server side — Registering tools with widgets

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

### Widget side — web/ directory

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
```

**Build pipeline:** `cd web && npm run build` → runs `build.sh` → loops over each `*.html` entry point → Vite builds each with `vite-plugin-singlefile` (inlines all JS/CSS into a single HTML) → output to `web/dist/`.

**Build after every widget change.** The server serves files from `web/dist/`, not source.

### AppProvider + app-context.tsx

All widgets are wrapped in `<AppProvider>`, which handles the SDK connection lifecycle:

1. `useApp()` — creates the `App` instance, connects via `PostMessageTransport`, returns `{ app, isConnected, error }`
2. `onAppCreated` callback — registers `app.ontoolresult` to parse tool data into React state
3. `useHostStyles(app)` — injects host CSS variables + fonts into the document automatically
4. Exposes `app`, `isConnected`, `error`, `toolOutput` via React context

The `hooks.ts` module provides convenience hooks that read from this context:
- `useToolOutput<T>()` — returns parsed tool result JSON (or `null` while loading)
- `useCallTool()` — returns `{ callTool(name, args), loading, error }` using `app.callServerTool()`
- `useTheme()` — re-exports `useDocumentTheme()` from SDK (returns `"light"` | `"dark"`)

### CSS theming approach

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

### Widget component pattern

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

### Adding a new widget

1. Create `web/src/widgets/foo.tsx` with the React component
2. Wrap the root render in `<AppProvider>`: `<AppProvider><FooWidget /></AppProvider>`
3. Create `web/foo.html` entry point (minimal HTML with `<div id="root">` + `<script type="module" src="/src/widgets/foo.tsx">`)
4. Add to `WIDGETS` array in `src/resources/register-widgets.ts` with name, URI (`ui://gym-tracker/foo.html`), file, description
5. In the tool file, use `registerAppToolWithMeta` with `_meta: { ui: { resourceUri: "ui://gym-tracker/foo.html" } }`
6. Add to `WIDGET_TOOLS` in `web/src/test-host.ts` with the tool name, default args, and type (`"ui"` for display tools, `"data"` for data tools with widgets). Also add sample data in `sampleData` for offline testing.
7. Build: `cd web && npm run build`

### Local development

See "Local Development Setup" section above for server startup and database management.

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

### How the postMessage protocol works (for debugging)

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

### Version compatibility

| Package | Where | Required version | Why |
|---|---|---|---|
| `@modelcontextprotocol/ext-apps` | `web/package.json` | `^1.0.0` | Provides `/react` hooks (`useApp`, `useHostStyles`, `useDocumentTheme`) |
| `@modelcontextprotocol/ext-apps/server` | root `package.json` | `^1.0.0` | Must match client version for `registerAppTool`/`registerAppResource` API compat |
| `@modelcontextprotocol/sdk` | root `package.json` | `^1.24.0` | Required by ext-apps as peer dependency |

After updating versions: `npm install` in both root and `web/`, then `cd web && npm run build`.

### Common pitfalls

- **Version mismatch**: `web/package.json` must have `@modelcontextprotocol/ext-apps: "^1.0.0"`. The `/react` subpath with `useApp()` hook requires v1.0+.
- **Missing AppProvider**: Every widget must wrap its root render in `<AppProvider>`. Without it, `useToolOutput()` and `useCallTool()` return null/no-op.
- **Forgot to rebuild**: Server serves `web/dist/*.html`. If you edit widget source but don't run `cd web && npm run build`, the old version is served.
- **Two npm installs**: Root and `web/` are separate npm projects. After cloning or updating deps, run `npm install` in BOTH directories.
- **CORS**: In dev, `getAllowedOrigins()` in server.ts allows localhost ports. For production, set `ALLOWED_ORIGINS` env var.
- **Dockerfile**: Must include a widget build stage (`cd web && npm ci && npm run build`) before the server stage.
- **Claude Desktop caching**: After rebuilding widgets, start a new conversation in Claude Desktop. It may cache the old MCP connection/resources from the previous conversation.

## Code Patterns

### JSON String Workaround
MCP clients may serialize arrays as JSON strings. Two helpers in `src/helpers/parse-helpers.ts`:
- `parseJsonParam<T>(value)`: parse JSON string or pass through. Returns `null` on failure. Used for complex object arrays (exercises bulk, days, overrides, skip).
- `parseJsonArrayParam<T>(value)`: same but wraps plain strings into `[value]` instead of returning null. Used for simple string arrays (tags, names, delete_sessions, exercise names in stats).

### Tool Response Format
All tools return `{ content: [{ type: "text", text: JSON.stringify({...}) }] }`. Errors add `isError: true`.

### Exercise Resolver
`resolveExercise(name, muscle_group?, equipment?, rep_type?, exercise_type?, client?)`: exact name → alias → ILIKE → auto-create. Accepts optional `PoolClient` for transaction support.
`findExercise(name, client?)`: same chain but returns null instead of auto-creating.

### PR Detection
`checkPRs()` in stats-calculator.ts. Only for `exercise_type = 'strength'`. Accepts optional `PoolClient` for transaction support. Upserts `personal_records` + appends to `pr_history`. Checks: max_weight, max_reps_at_{weight}, estimated_1rm (Epley: `weight × (1 + reps/30)`).

### Transactions
`log_exercise` (single and bulk) and `manage_templates` "start" action wrap their operations in `BEGIN`/`COMMIT` using `pool.connect()`. The `PoolClient` is passed through to `resolveExercise()` and `checkPRs()` for atomicity.

### Testing Pattern
Each tool test: `vi.mock` dependencies at top level with `vi.hoisted()`, capture `toolHandler` from `server.tool()` mock, call handler directly with params. Pool queries mocked via `mockQuery` / `mockClientQuery` (for transactions).

## Migrations (001-015)

| # | Description |
|---|---|
| 001 | Full schema: 11 tables + indexes |
| 002 | 16 exercises with aliases + PPL program |
| 003 | Add Deadlift, normalize muscle groups |
| 004 | rest_seconds, notes, session templates tables |
| 005 | Fix seed data references |
| 006 | `users` table + `user_id` FK on sessions, programs, personal_records, session_templates, user_profile |
| 007 | FK ON DELETE SET NULL for sessions → program_versions/days |
| 008 | `pr_history` table, `deleted_at` on sessions, `tags TEXT[]` (GIN) |
| 009 | `rep_type` + `exercise_type` on exercises with CHECK constraints |
| 010 | Exercise tenancy: `user_id` FK on exercises, global + per-user unique index |
| 011 | Auth persistence: `auth_tokens`, `auth_codes`, `dynamic_clients` tables (replace in-memory stores) |
| 012 | `body_measurements` table, `pg_trgm` extension + trigram indexes, `description` column on exercises |
| 013 | `group_type` column on program_day_exercises |
| 014 | Global programs: nullable `user_id` on programs + seed 3 global program templates (Full Body 3x, Upper/Lower 4x, PPL 6x) |
| 015 | Seed 25 new global exercises + 22 well-known workout programs (Starting Strength, StrongLifts, 5/3/1 BBB, PHUL, PHAT, nSuns, Arnold Split, Reddit PPL, etc.) |

## Pending (Phase 3)

- Better error messages in Spanish
- Tests for `body-measurements.ts` and `export.ts`
- Rate limiting persistence (currently in-memory, resets on deploy)
- Persist `STATE_SECRET` as a Cloud Run secret (currently falls back to ephemeral random)
- Widget UIs are styled (profile, session, stats, today-plan, exercises, programs, programs-list, templates, measurements, dashboard, workout, workouts, available-programs); export widget intentionally shows raw JSON
- Apply pending changes pattern to `show_program` and `show_programs` (replace inline editing with read-only + diff confirm flow)
- Remove debug logging from server.ts (MCP method/resource logging) and register-widgets.ts before production
