# Gym Tracker — Project Context

MCP Server that turns Claude into a gym training partner. Users talk naturally in Spanish/English, Claude calls tools.

## CI/CD

Push to `main` triggers `.github/workflows/deploy.yml`:
1. **check**: `npm ci` → `npx tsc --noEmit` → `npx vitest run`
2. **deploy** (only on push, not PR): `gcloud run deploy` to Cloud Run

Always run `npm test` before committing. TypeScript must compile cleanly (`tsc --noEmit`).

## Deployment

| Service | Value |
|---|---|
| Cloud Run | `https://gym-tracker-680099996238.us-central1.run.app` |
| MCP Endpoint | `https://gym-tracker-680099996238.us-central1.run.app/mcp` |
| Neon Postgres | `autumn-rice-23097289` (aws-us-east-2) |
| GCP Project | `kairos-loyalty-api` |

## Stack

Node.js + TypeScript, Express, `@modelcontextprotocol/sdk` (StreamableHTTP), PostgreSQL via `pg`, Zod, Vitest, WorkOS OAuth 2.1, JOSE, AsyncLocalStorage.

## Project Structure

```
server.ts                    # Express + MCP server + auth middleware
src/auth/                    # middleware.ts, oauth-routes.ts, workos.ts
src/context/user-context.ts  # AsyncLocalStorage: getUserId() / runWithUser()
src/db/                      # connection.ts, migrate.ts, run-migrations.ts, migrations/001-009
src/tools/                   # 11 files → 13 MCP tools
src/helpers/                 # exercise-resolver.ts, stats-calculator.ts, program-helpers.ts
src/tools/__tests__/         # Vitest tests (1 per tool file)
```

## Authentication & Multi-Tenancy

- WorkOS OAuth 2.1: `/auth/authorize` → `/auth/callback` → Bearer token
- `authenticateToken()` middleware resolves Bearer → WorkOS user → `users` table (upsert)
- `runWithUser(userId, fn)` wraps each request in AsyncLocalStorage
- All tools call `getUserId()` to scope queries. All tables have `user_id` FK with per-user unique constraints.

## Database Schema

```
users (id, external_id UNIQUE, email, created_at, last_login)
user_profile (user_id FK UNIQUE, data JSONB)
exercises (name UNIQUE, muscle_group, equipment, rep_type, exercise_type)
exercise_aliases (exercise_id FK, alias UNIQUE)
programs (user_id FK, name, is_active) → program_versions → program_days → program_day_exercises
sessions (user_id FK, started_at, ended_at, tags TEXT[], deleted_at) → session_exercises → sets
personal_records (user_id FK, exercise_id FK, record_type) UNIQUE per user+exercise+type
pr_history (user_id FK, exercise_id FK, record_type, value, achieved_at)
session_templates (user_id FK, name UNIQUE per user) → session_template_exercises
```

Key: per-set rows, program versioning, soft delete on sessions, GIN index on tags, `rep_type` (reps/seconds/meters/calories), `exercise_type` (strength/mobility/cardio/warmup — PRs only for strength).

## MCP Tools (13)

| Tool | Actions / Params |
|---|---|
| `manage_profile` | get, update (JSONB) |
| `manage_exercises` | list, search, add, add_bulk, update, update_bulk, delete, delete_bulk |
| `manage_program` | list, get, create, update (days→new version, or metadata-only), activate, delete, delete_bulk, history |
| `start_session` | program_day?, date?, tags? — infers day from weekday |
| `end_session` | notes?, force?, tags? — summary + comparison vs last |
| `get_active_session` | no params — returns active session with exercises or `{active: false}` |
| `get_today_plan` | no params — today's day + exercises + last workout (read-only, no session created) |
| `log_exercise` | single or bulk (`exercises[]`), auto-session, auto-create, drop_percent, PR check |
| `log_routine` | log full program day, overrides[], skip[], auto_end, date?, tags? |
| `get_history` | period, exercise?, program_day?, tags? filter |
| `get_stats` | single (`exercise`) or multi (`exercises[]`), period — PRs, progression, volume, frequency |
| `edit_log` | update/delete sets, bulk[], delete_session, restore_session, delete_sessions[] |
| `manage_templates` | save, list, start, delete, delete_bulk |

## Code Patterns

### JSON String Workaround
MCP clients may serialize arrays as JSON strings. All array params use:
```typescript
let list = rawParam as any;
if (typeof list === 'string') {
  try { list = JSON.parse(list); } catch { list = null; }
}
```
Applies to: exercises, names, days, overrides, skip, tags, bulk, delete_sessions.

### Tool Response Format
All tools return `{ content: [{ type: "text", text: JSON.stringify({...}) }] }`. Errors add `isError: true`.

### Exercise Resolver
`resolveExercise(name, muscle_group?, equipment?, rep_type?, exercise_type?)`: exact name → alias → ILIKE → auto-create.
`findExercise(name)`: same chain but returns null instead of auto-creating.

### PR Detection
`checkPRs()` in stats-calculator.ts. Only for `exercise_type = 'strength'`. Upserts `personal_records` + appends to `pr_history`. Checks: max_weight, max_reps_at_{weight}, estimated_1rm (Epley: `weight × (1 + reps/30)`).

### Testing Pattern
Each tool test: `vi.mock` dependencies at top level with `vi.hoisted()`, capture `toolHandler` from `server.tool()` mock, call handler directly with params. Pool queries mocked via `mockQuery` / `mockClientQuery` (for transactions).

## Migrations (001-009)

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

## Pending (Phase 3)

- Better error messages in Spanish
- CSV export
- `pg_trgm` extension for fuzzy matching
