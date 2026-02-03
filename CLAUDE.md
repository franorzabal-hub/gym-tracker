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
1. **check** (automatic): `npm ci` → `cd web && npm ci` → `npx tsc --noEmit` → `cd web && npm run build` → `npx vitest run` — runs on every push/PR
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
2. `cloudflared tunnel --protocol http2 run gym-tracker` (exposes local server at https://gym-tracker.1kairos.com)
3. For widget development: `cd web && npm run dev:host` → opens http://localhost:5173/test-host.html with HMR
4. For production/Claude Desktop: `cd web && npm run build` (only needed when done iterating)

### Local dev tunnel
The named Cloudflare tunnel `gym-tracker` routes `https://gym-tracker.1kairos.com` → `localhost:3001`.
- MCP endpoint: `https://gym-tracker.1kairos.com/mcp`
- Tunnel ID: `acc9fe70-c92d-4a49-9a19-f836409a0bed`
- Credentials: `~/.cloudflared/acc9fe70-c92d-4a49-9a19-f836409a0bed.json`

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

Node.js + TypeScript, Express, CORS, `@modelcontextprotocol/sdk` (StreamableHTTP), `@modelcontextprotocol/ext-apps` (MCP Apps widgets), PostgreSQL via `pg`, Zod, Vitest, WorkOS OAuth 2.1, AsyncLocalStorage.

**Web/Widgets:** React 19, Vite, Tailwind CSS 4, `@openai/apps-sdk-ui` (official UI kit for ChatGPT Apps).

## Project Structure

```
server.ts                    # Express + MCP server + auth middleware
src/auth/                    # middleware.ts, oauth-routes.ts, workos.ts
src/context/user-context.ts  # AsyncLocalStorage: getUserId() / runWithUser()
src/db/                      # connection.ts, migrate.ts, run-migrations.ts, migrations/001-021
src/tools/                   # 15 files → 19 MCP tools (12 data + 7 display)
src/helpers/                 # exercise-resolver.ts, stats-calculator.ts, program-helpers.ts, log-exercise-helper.ts, group-helpers.ts, section-helpers.ts, date-helpers.ts, parse-helpers.ts, tool-response.ts
src/helpers/__tests__/       # Vitest tests for helpers (exercise-resolver, program-helpers, stats-calculator, group-helpers, section-helpers)
src/resources/               # register-widgets.ts — registers all widget resources
src/tools/__tests__/         # Vitest tests for tools
docs/                        # Product specs (onboarding-flow, product-description, user-journeys)
web/                         # Widget UI (separate npm project, see web/README.md)
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
programs (user_id FK nullable, name, is_active, is_validated) → program_versions → program_days → program_day_exercises (group_id FK, section_id FK, rest_seconds, target_reps_per_set INTEGER[], target_weight_per_set REAL[])
  → user_id NULL = global template program; user_id set = user-owned program
  → per-set arrays: NULL = uniform (use scalar target_reps/target_weight), array = per-set progression (length = target_sets)
program_exercise_groups (day_id FK, group_type CHECK superset|paired|circuit, label, notes, rest_seconds, sort_order)
program_sections (day_id FK CASCADE, label, notes, sort_order)
sessions (user_id FK, started_at, ended_at, tags TEXT[], deleted_at, is_validated) → session_exercises (group_id FK, section_id FK, rest_seconds) → sets (notes)
session_exercise_groups (session_id FK, group_type, label, notes, rest_seconds, sort_order)
session_sections (session_id FK CASCADE, label, notes, sort_order)
personal_records (user_id FK, exercise_id FK, record_type) UNIQUE per user+exercise+type
pr_history (user_id FK, exercise_id FK, record_type, value, achieved_at)
body_measurements (user_id FK, measurement_type, value NUMERIC, measured_at, notes)
auth_tokens (token PK, workos_user_id, email, expires_at)
auth_codes (code PK, workos_user_id, email, expires_at, code_challenge, code_challenge_method)
dynamic_clients (client_id PK, redirect_uris TEXT[])
```

Key: per-set rows, program versioning, soft delete on sessions, GIN index on tags, `rep_type` (reps/seconds/meters/calories), `exercise_type` (strength/mobility/cardio/warmup — PRs only for strength). Exercise groups (superset/paired/circuit) are first-class entities with label, notes, rest_seconds — 2 tables (program/session) for referential integrity. Sections are optional containers between day and exercises (e.g. "Warm-up", "Main work") — 2 tables (program_sections/session_sections) with section_id FK on exercise tables (ON DELETE SET NULL). Auth tokens/codes persisted in Postgres with TTL cleanup every 15 min.

## MCP Tools (19)

### Data Tools (12) — return JSON, no UI

| Tool | Actions / Params |
|---|---|
| `get_context` | MANDATORY first call. Returns full user context in single call: profile, program, active_workout, routing. Follow `required_action` field: "setup_profile" → show_profile, "choose_program" → show_programs |
| `manage_profile` | get, update (JSONB) |
| `manage_exercises` | list, search, add, add_bulk, update, update_bulk, delete, delete_bulk |
| `manage_program` | list, get, create, clone, update, activate, delete, delete_bulk, history, patch_exercise, patch_day, add_exercise, remove_exercise |
| `log_workout` | Unified: start workout, log exercise(s), log routine day. Auto-creates workout, infers program day, supports overrides/skip, single/bulk exercises, PR check |
| `end_workout` | notes?, force?, tags? — summary + comparison vs last |
| `get_today_plan` | no params — today's day + exercises + last workout (read-only, no workout created) |
| `get_workouts` | period, exercise?, program_day?, tags? filter, workout_id for specific workout |
| `get_stats` | single (`exercise`) or multi (`exercises[]`), period — PRs, progression, volume, frequency |
| `edit_workout` | update/delete sets, bulk[], delete_workout, restore_workout, delete_workouts[], validate_workout |
| `manage_measurements` | log, history, latest — temporal tracking (weight_kg, body_fat_pct, chest_cm, etc.) |
| `export_data` | json or csv — scopes: all, sessions, exercises, programs, measurements, prs; period filter |

### Display Tools (7) — render visual widgets, LLM must NOT repeat data

| Tool | Widget | Description |
|---|---|---|
| `show_profile` | profile.html | Read-only profile card. Supports `pending_changes` param for LLM-proposed edits with visual diff + confirm button |
| `show_programs` | programs-list.html | Unified programs widget. `mode="user"` (default) shows user's programs. `mode="available"` shows global templates with clone capability |
| `show_available_programs` | programs-list.html | DEPRECATED: Use `show_programs({ mode: "available" })` |
| `show_program` | programs.html | Program viewer with days, exercises, supersets, weights. Defaults to active program, optional `name` param |
| `show_dashboard` | dashboard.html | Training dashboard with KPIs, volume charts, streak, PRs, muscle group distribution |
| `show_workout` | workout.html | Workout session viewer. Optional `session_id` to view a specific session. Without it, shows the most recent session. Read-only for ended sessions; active sessions show inline-editable sets (reps, weight, RPE, type) with add/remove. |
| `show_workouts` | workouts.html | Workout history list with clickable session cards. Filters: period, exercise, program_day, tags, limit, offset. Each card opens `show_workout` with that session_id. |

## MCP Apps Widgets

React-based HTML widgets rendered by MCP hosts (Claude Desktop, claude.ai, ChatGPT). Display tools (`show_*`) return `_meta.ui.resourceUri` linking to compiled single-file HTML widgets in `web/dist/`. Widgets are registered for both MCP (`ui://gym-tracker/`) and OpenAI/ChatGPT (`ui://gym-tracker-oai/`) hosts.

**Key principle:** The LLM is the editor; the widget is the reviewer. All editing goes through conversation + `pending_changes` param → visual diff → user confirms.

For full widget documentation, see:
- [`web/README.md`](web/README.md) — architecture, theming, component patterns, dev workflow
- [`web/DESIGN.md`](web/DESIGN.md) — design system: tokens, badges, layout, OpenAI Apps SDK best practices

## Code Patterns

### JSON String Workaround
MCP clients may serialize arrays as JSON strings. Two helpers in `src/helpers/parse-helpers.ts`:
- `parseJsonParam<T>(value)`: parse JSON string or pass through. Returns `null` on failure. Used for complex object arrays (exercises bulk, days, overrides, skip).
- `parseJsonArrayParam<T>(value)`: same but wraps plain strings into `[value]` instead of returning null. Used for simple string arrays (tags, names, delete_workouts, exercise names in stats).

### Tool Response Format
All tools return `{ content: [{ type: "text", text: JSON.stringify({...}) }] }`. Errors add `isError: true`.

### Exercise Resolver
`resolveExercise(name, muscle_group?, equipment?, rep_type?, exercise_type?, client?)`: exact name → alias → ILIKE → auto-create. Accepts optional `PoolClient` for transaction support.
`findExercise(name, client?)`: same chain but returns null instead of auto-creating.

### PR Detection
`checkPRs()` in stats-calculator.ts. Only for `exercise_type = 'strength'`. Accepts optional `PoolClient` for transaction support. Upserts `personal_records` + appends to `pr_history`. Checks: max_weight, max_reps_at_{weight}, estimated_1rm (Epley: `weight × (1 + reps/30)`).

### Transactions
`log_exercise` (single and bulk) wraps operations in `BEGIN`/`COMMIT` using `pool.connect()`. The `PoolClient` is passed through to `resolveExercise()` and `checkPRs()` for atomicity.

### Testing Pattern
Each tool test: `vi.mock` dependencies at top level with `vi.hoisted()`, capture `toolHandler` from `server.tool()` mock, call handler directly with params. Pool queries mocked via `mockQuery` / `mockClientQuery` (for transactions).

### Program Patch Actions (Inline Updates)
`manage_program` supports lightweight patch actions that modify exercises/days without creating new versions:
- `patch_exercise`: Update weight/reps/sets/rpe/notes of a single exercise
- `patch_day`: Update day label or weekdays
- `add_exercise`: Add exercise to existing day
- `remove_exercise`: Remove exercise from day

**Identification:** Pass `program_day_exercise_id` (from `show_program` response) OR `day` + `exercise` name.

**Ambiguity handling:** If multiple exercises match (e.g., same exercise twice in a day), returns `{ ambiguous: true, matches: [...] }`. LLM should ask user to choose, then retry with the specific `program_day_exercise_id`.

## Migrations

21 migrations in `src/db/migrations/` (001–021). Each file is self-describing — read the SQL for details. Auto-applied on server startup via `runMigrations()`.

## Pending (Phase 3)

- Better error messages in Spanish
- Tests for `body-measurements.ts`, `export.ts`, and `workout.ts`
- Rate limiting persistence (currently in-memory, resets on deploy)
- Persist `STATE_SECRET` as a Cloud Run secret (currently falls back to ephemeral random)
- Apply pending changes pattern to `show_program` and `show_programs` (replace inline editing with read-only + diff confirm flow)
- Remove debug logging from server.ts (MCP method/resource logging) and register-widgets.ts before production
