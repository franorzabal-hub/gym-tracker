# Gym Tracker — MCP Server

## Vision

An MCP Server that turns Claude into a gym training partner. The user talks naturally — "hice peso muerto 100kg 5x5", "hice la rutina de push", "cuanto levante en banca la semana pasada?" — and Claude logs, queries, and analyzes workout data automatically.

**Conversational (MCP Tools)** — The user talks to Claude, Claude calls tools. Works on mobile, desktop, anywhere Claude runs.

**Priority: conversational flow above everything else.** The tools must be designed so Claude can interpret natural language and map it to the right operations without friction.

## Status

- **Phase 1: Complete** — Core MCP Server deployed and functional
- **Phase 2: Complete** — Multi-tenant auth, bulk operations, exercise types, tags, soft delete, PR history
- **Phase 3: Pending** — Polish (better error messages in Spanish, CSV exports, `pg_trgm` fuzzy matching)

### Deployment

| Service | URL |
|---|---|
| **Cloud Run** | `https://gym-tracker-680099996238.us-central1.run.app` |
| **MCP Endpoint** | `https://gym-tracker-680099996238.us-central1.run.app/mcp` |
| **Health Check** | `https://gym-tracker-680099996238.us-central1.run.app/health` |
| **Neon Project** | `autumn-rice-23097289` (aws-us-east-2) |
| **GCP Project** | `kairos-loyalty-api` |

## Key Design Decisions

### Informed by Strong, Hevy, StrengthLog

1. **Per-set tracking** — Each set is its own record with reps, weight, and optional RPE.
2. **Set types** — Warmup, working, drop set, failure.
3. **RPE (Rate of Perceived Exertion)** — Scale 1-10.
4. **Exercise auto-creation** — If the user says an exercise that doesn't exist, create it.
5. **Aliases / fuzzy matching** — "press banca", "bench press", "banca plana" all resolve to the same exercise.
6. **Workout sessions** — Group exercises per gym visit. Support soft delete + tags.
7. **Programs with versioning** — Multi-day programs (PPL, Upper/Lower) with automatic version history on every change.
8. **Edit/delete** — "No, eran 80kg no 100" works. Bulk edit/delete supported.
9. **Progress stats** — PR tracking, volume over time, estimated 1RM. Multi-exercise stats.
10. **Exercise types** — `rep_type` (reps/seconds/meters/calories) and `exercise_type` (strength/mobility/cardio/warmup). PRs only tracked for strength.
11. **Session templates** — Save a workout as a reusable blueprint and start new sessions from it.
12. **Multi-tenant** — OAuth 2.1 via WorkOS. All data scoped per user via `user_id` FK.

### What we skip (for now)

- Nutrition tracking
- Body measurements / body composition
- Social features
- Rest timers
- AI-generated programs

## Architecture

### Stack
- **Runtime**: Node.js + TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (StreamableHTTP transport)
- **Database**: PostgreSQL on [Neon](https://neon.tech) (serverless, scales to zero)
- **SQL**: `pg` (node-postgres) with raw SQL
- **HTTP**: Express (serves MCP endpoint + OAuth routes)
- **Auth**: WorkOS OAuth 2.1 + JOSE (JWT verification)
- **Context**: AsyncLocalStorage for per-request user isolation
- **Testing**: Vitest
- **Validation**: Zod
- **Server Run**: `tsx` (dev + production via Dockerfile)
- **Deploy**: Google Cloud Run (scales to zero, free tier)

### Infrastructure

```
Claude (mobile/web/desktop)
    │
    ▼  HTTPS + Bearer Token
Google Cloud Run                ←── Scales to zero, free tier
  gym-tracker container
  (Node.js + Express)
    │
    ├── /mcp          ←── MCP StreamableHTTP endpoint
    ├── /auth/*        ←── OAuth 2.1 routes (WorkOS)
    └── /health        ←── Health check
    │
    ▼  postgres:// (TLS)
Neon Serverless Postgres        ←── Scales to zero, free tier
  ep-rough-feather-aeyjb13o
  database: neondb
```

**Cost: $0/month** for personal use. Both Cloud Run and Neon scale to zero when idle.

### Project Structure

```
gym-tracker/
├── package.json
├── tsconfig.json
├── Dockerfile                # Cloud Run container
├── .env                      # DATABASE_URL, WORKOS_* (local dev, gitignored)
├── .env.example
├── README.md                 # Quickstart guide
├── SCOPE.md                  # This file — architecture & design
├── server.ts                 # Express + MCP server + tool registration + auth middleware
├── src/
│   ├── auth/
│   │   ├── middleware.ts     # Bearer token authentication, user upsert
│   │   ├── oauth-routes.ts   # OAuth 2.1 callback routes (WorkOS)
│   │   └── workos.ts         # WorkOS client configuration
│   ├── context/
│   │   └── user-context.ts   # AsyncLocalStorage for per-request userId
│   ├── db/
│   │   ├── connection.ts     # pg Pool with SSL
│   │   ├── migrate.ts        # Standalone migration runner (npm run migrate)
│   │   ├── run-migrations.ts # Importable migration function (used by server.ts on startup)
│   │   └── migrations/
│   │       ├── 001_schema.sql          # Full schema (11 tables + indexes)
│   │       ├── 002_seed.sql            # 16 exercises with aliases + PPL program
│   │       ├── 003_fixes.sql           # Add Deadlift, normalize muscle groups
│   │       ├── 004_rest_and_notes.sql  # rest_seconds, notes columns, templates tables
│   │       ├── 005_fix_seed_references.sql  # Fix seed data references
│   │       ├── 006_multi_tenant.sql    # users table + user_id FK on all tables
│   │       ├── 007_fix_program_fk.sql  # FK ON DELETE SET NULL for sessions → program_versions/days
│   │       ├── 008_features.sql        # pr_history table, soft delete (deleted_at), tags (TEXT[])
│   │       └── 009_improvements.sql    # rep_type + exercise_type columns on exercises
│   ├── tools/
│   │   ├── profile.ts        # manage_profile (get/update JSONB)
│   │   ├── exercises.ts      # manage_exercises (list/search/add/add_bulk/update/update_bulk/delete/delete_bulk)
│   │   ├── programs.ts       # manage_program (list/get/create/update/activate/delete/delete_bulk/history)
│   │   ├── session.ts        # start_session + end_session + get_active_session
│   │   ├── log-exercise.ts   # log_exercise (auto-session, auto-create, PR check, bulk)
│   │   ├── log-routine.ts    # log_routine (log full day with overrides/skips)
│   │   ├── history.ts        # get_history (period/exercise/day/tags filters)
│   │   ├── stats.ts          # get_stats (PRs, progression, volume trends, multi-exercise)
│   │   ├── edit-log.ts       # edit_log (update/delete sets, delete/restore sessions, bulk)
│   │   └── templates.ts      # manage_templates (save/list/start/delete/delete_bulk)
│   ├── helpers/
│   │   ├── exercise-resolver.ts  # Fuzzy match: exact → alias → ILIKE → auto-create
│   │   ├── stats-calculator.ts   # E1RM (Epley), volume calc, PR detection + upsert
│   │   └── program-helpers.ts    # Version cloning, day inference, active program lookup
│   └── tools/__tests__/         # Vitest tests for all tools + helpers
```

## Authentication

### OAuth 2.1 + WorkOS

The server uses WorkOS as the OAuth provider. Authentication flow:

1. Client redirects to `/auth/authorize` → WorkOS login page
2. User authenticates → WorkOS calls `/auth/callback`
3. Server stores access token in memory, returns it to client
4. Client includes `Authorization: Bearer <token>` on MCP requests

### Multi-Tenant Isolation

- Every request runs through `authenticateToken()` middleware
- User ID resolved from Bearer token → WorkOS user → local `users` table (upsert)
- `runWithUser(userId, handler)` wraps each request in `AsyncLocalStorage`
- All tools call `getUserId()` to scope queries to the authenticated user
- All data-bearing tables have `user_id INTEGER REFERENCES users(id)` with per-user unique constraints

## Database Schema

### Entity Model

```
users
user_profile (per-user, JSONB)
exercises → exercise_aliases
programs → program_versions → program_days → program_day_exercises
sessions → session_exercises → sets
personal_records
pr_history
session_templates → session_template_exercises
```

### Tables

```sql
-- USERS (multi-tenant)
users (id SERIAL PK, external_id TEXT UNIQUE, email TEXT, created_at, last_login)

-- USER PROFILE (per-user, JSONB flexible storage)
user_profile (id, user_id FK UNIQUE, data JSONB, updated_at)

-- EXERCISES (global, shared across users)
exercises (id, name UNIQUE, muscle_group, equipment, rep_type, exercise_type, created_at)
exercise_aliases (id, exercise_id FK, alias UNIQUE)

-- PROGRAMS (multi-day routines with versioning, per-user)
programs (id, user_id FK, name, description, is_active, created_at)
  UNIQUE(user_id, LOWER(name))
program_versions (id, program_id FK, version_number, change_description, created_at)
  UNIQUE(program_id, version_number)
program_days (id, version_id FK, day_label, weekdays INTEGER[], sort_order)
program_day_exercises (id, day_id FK, exercise_id FK, target_sets, target_reps,
  target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)

-- SESSIONS (per-user)
sessions (id, user_id FK, started_at, ended_at, program_version_id FK, program_day_id FK,
  notes, tags TEXT[], deleted_at TIMESTAMPTZ)
session_exercises (id, session_id FK, exercise_id FK, sort_order, superset_group,
  rest_seconds, notes)
sets (id, session_exercise_id FK, set_number, set_type, reps, weight, rpe, completed,
  notes, logged_at)

-- PERSONAL RECORDS (denormalized, upserted on log, per-user)
personal_records (id, user_id FK, exercise_id FK, record_type, value, achieved_at, set_id FK)
  UNIQUE(user_id, exercise_id, record_type)

-- PR HISTORY (full timeline of PRs, per-user)
pr_history (id, user_id FK, exercise_id FK, record_type, value, achieved_at, set_id FK)

-- TEMPLATES (reusable session blueprints, per-user)
session_templates (id, user_id FK, name, source_session_id FK, created_at)
  UNIQUE(user_id, LOWER(name))
session_template_exercises (id, template_id FK, exercise_id FK, target_sets, target_reps,
  target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)
```

### Schema Decisions

| Decision | Reason |
|---|---|
| **Per-set rows** | Captures failed reps, drop sets, RPE per set. "5, 5, 5, 4, 3" is 5 rows. |
| **Program versioning** | Every change creates a new version. Old sessions reference their version. Full history preserved. |
| **JSONB user profile** | Flexible — Claude can store anything via conversation without schema changes. |
| **exercise_aliases** | "bench press" and "press banca" resolve to the same exercise without fuzzy matching on every query. |
| **personal_records upsert** | Denormalized table avoids scanning all sets. Updated automatically on each log. |
| **pr_history** | Full PR timeline vs denormalized current PRs. Allows "when did I first hit 100kg?" |
| **weekdays INTEGER[]** | ISO weekdays (1=Mon..7=Sun) as Postgres array. Enables day-of-week inference. |
| **user_id on everything** | Multi-tenant isolation. Unique constraints are per-user, not global. |
| **soft delete (deleted_at)** | Sessions can be deleted and restored. NULL = active, timestamp = deleted. |
| **tags TEXT[]** | Freeform labels on sessions (e.g. "deload", "morning"). GIN-indexed for fast `@>` queries. |
| **rep_type / exercise_type** | Distinguishes measurement unit and exercise category. PRs only tracked for `strength` type. |

## Exercise Schema

### rep_type

How the exercise is measured:

| Value | Meaning | Example |
|---|---|---|
| `reps` (default) | Repetitions | Bench Press 4x8 |
| `seconds` | Time under tension | Plank 3x60s |
| `meters` | Distance | Farmer's Walk 3x40m |
| `calories` | Energy output | Rowing 500cal |

### exercise_type

Category that affects PR tracking and stats:

| Value | Meaning | PRs Tracked? |
|---|---|---|
| `strength` (default) | Weight training | Yes (max_weight, max_reps, e1RM) |
| `mobility` | Stretching/mobility | No |
| `cardio` | Cardiovascular | No |
| `warmup` | Warm-up exercises | No |

## MCP Tools (12 total)

### 1. `manage_profile`
Manage user profile data (JSONB). Claude calls `get` at conversation start for context.

```
Input: { action: "get" | "update", data?: object }
Output: { profile: {...} }
```

### 2. `manage_exercises`
List, search, add, update, or delete exercises with aliases. Supports bulk operations.

```
Input: {
  action: "list" | "add" | "add_bulk" | "search" | "update" | "update_bulk" | "delete" | "delete_bulk",
  name?, muscle_group?, equipment?, aliases?,
  hard_delete?, rep_type?, exercise_type?,
  names?,      // string[] for delete_bulk
  exercises?,  // object[] for add_bulk / update_bulk
}
```

| Action | Description |
|---|---|
| `list` | List all exercises, optionally filtered by `muscle_group` |
| `search` | Search exercises by name/alias (fuzzy ILIKE) |
| `add` | Add a single exercise with optional aliases, muscle_group, equipment, rep_type, exercise_type |
| `add_bulk` | Add multiple exercises. Pass `exercises` array. Returns `{ created, existing, failed }` |
| `update` | Update a single exercise by name (muscle_group, equipment, rep_type, exercise_type) |
| `update_bulk` | Update multiple exercises. Pass `exercises` array. Returns `{ updated, not_found, failed }` |
| `delete` | Permanently delete one exercise. Requires `hard_delete=true`. Cascade deletes aliases. |
| `delete_bulk` | Permanently delete multiple exercises. Pass `names` array + `hard_delete=true`. Returns `{ deleted, not_found, failed }` |

### 3. `manage_program`
Full program CRUD with automatic version history. Supports bulk delete.

```
Input: {
  action: "list" | "get" | "create" | "update" | "activate" | "delete" | "delete_bulk" | "history",
  name?, new_name?, description?,
  days?: [{ day_label, weekdays?, exercises: [{ exercise, sets, reps, weight?, rpe?, superset_group?, rest_seconds?, notes? }] }],
  change_description?, hard_delete?,
  names?,  // string[] for delete_bulk
}
```

| Action | Description |
|---|---|
| `list` | List all programs with active status and current version |
| `get` | Get program details with all days and exercises |
| `create` | Create program + v1 + days + exercises. Auto-activates. |
| `update` | With `days`: creates new version. Without `days`: update metadata only (new_name, description). |
| `activate` | Set as active program (deactivates others) |
| `delete` | Soft delete (deactivate). With `hard_delete=true`: permanent removal. |
| `delete_bulk` | Delete multiple programs. Pass `names` array. Optional `hard_delete=true`. Returns `{ deleted/deactivated, not_found }`. |
| `history` | List all versions with dates and change descriptions |

### 4. `start_session`
Start a new workout. Infers program day from weekday if not specified.

```
Input: { program_day?, notes?, date?, tags? }
Output: {
  session_id, started_at, tags,
  program_day?: { label, exercises },
  last_workout?: { date, exercises: [{ name, sets, summary }] }
}
```

- `date`: ISO date string (e.g. "2025-01-28") to backdate the session.
- `tags`: string array to label the session (e.g. ["deload", "morning"]).
- Returns `last_workout` with per-exercise set summaries from the previous session on the same program day.

### 5. `end_session`
End active session with summary and comparison.

```
Input: { notes?, force?: boolean, tags? }
Output: {
  session_id, duration_minutes, exercises_count, total_sets, total_volume_kg,
  exercises, supersets?,
  comparison?: { vs_last, volume_change, exercise_changes }
}
```

- `force`: Close session even if no exercises are logged (defaults to false).
- `tags`: Set/replace tags on the session.
- `comparison`: Volume change % and per-exercise weight changes vs the previous session on the same program day.

### 6. `get_active_session`
Check if there is an active (open) workout session.

```
Input: {} (no parameters)
Output: {
  active: boolean,
  session_id?, started_at?, duration_minutes?,
  program_day?, tags?,
  exercises?: [{ name, superset_group, sets }]
}
```

Returns session details with exercises logged so far, or `{ active: false }`.

### 7. `log_exercise`
Log sets for an exercise. Auto-creates session and exercise if needed.

```
Input: {
  exercise?, sets?, reps? (number | number[]), weight?, rpe?,
  set_type? ("warmup"|"working"|"drop"|"failure"),
  notes?, rest_seconds?, superset_group?,
  muscle_group?, equipment?, set_notes?, drop_percent?,
  rep_type?, exercise_type?,
  exercises?: ExerciseEntry[]  // bulk mode
}
Output: { exercise_name, is_new_exercise, session_id, logged_sets, new_prs?, rest_seconds? }
```

- `reps` as array: per-set reps, e.g. `[10, 8, 6]` for 3 sets.
- `drop_percent`: auto-decreases weight per set (e.g. 100kg with 10% → 100, 90, 80...).
- `rep_type` / `exercise_type`: passed to exercise auto-create if exercise is new.
- `exercises` (bulk mode): array of exercise entries to log multiple exercises in one call.

### 8. `log_routine`
Log an entire program day at once with optional overrides/skips.

```
Input: { program_day?, overrides?, skip?, auto_end?, date?, tags? }
Output: { session_id, day_label, exercises_logged, total_sets, total_volume_kg, new_prs?, session_ended }
```

- `auto_end`: auto-close session after logging (default true). Set false to keep open.
- `date`: ISO date to backdate the session.
- `tags`: string array for session tags.

### 9. `get_history`
Query workout history with filters.

```
Input: { period?: "today" | "week" | "month" | "year" | number, exercise?, program_day?, tags? }
Output: { sessions: [...], summary: { total_sessions, total_volume_kg, exercises_count } }
```

- `tags`: filter sessions that have ALL of the specified tags (`@>` containment query).

### 10. `get_stats`
Exercise statistics with progression tracking. Supports multiple exercises.

```
Input: { exercise?, exercises?, period?: "month" | "3months" | "year" | "all" }
Output (single): { exercise, personal_records, progression, volume_trend, frequency, pr_timeline }
Output (multi): { stats: [{ exercise, personal_records, ... }, ...] }
```

- `exercise`: single exercise name (returns flat object).
- `exercises`: array of exercise names (returns `{ stats: [...] }`).
- In multi mode, not-found exercises appear in the array with an `error` field.

### 11. `edit_log`
Edit or delete previously logged sets, or manage session lifecycle.

```
Input: {
  exercise?, session?: "today" | "last" | date, action?: "update" | "delete",
  updates?, set_numbers?, set_ids?, set_type_filter?,
  bulk?: [{ exercise, action?, set_numbers?, set_ids?, set_type_filter?, updates? }],
  delete_session?, restore_session?, delete_sessions?
}
```

| Mode | Description |
|---|---|
| Single edit | Update/delete sets for one exercise in a session |
| Bulk edit | `bulk` array: multi-exercise edits in one call |
| `delete_session` | Soft-delete a session by ID (sets `deleted_at`) |
| `restore_session` | Restore a soft-deleted session (clears `deleted_at`) |
| `delete_sessions` | Bulk soft-delete: array of session IDs. Returns `{ deleted, not_found }` |

- `set_ids`: target specific sets by ID (alternative to set_numbers).
- `set_type_filter`: filter sets by type ("warmup", "working", "drop", "failure").

### 12. `manage_templates`
Manage session templates — save a workout as a reusable template or start a session from one.

```
Input: { action: "save" | "list" | "start" | "delete" | "delete_bulk", name?, session_id?, date?, names? }
```

| Action | Description |
|---|---|
| `save` | Save a completed session as a template. Pass `session_id` (or `"last"`) and `name`. |
| `list` | List all saved templates with exercises. |
| `start` | Start a new session from a template (exercises only, no sets). |
| `delete` | Delete a single template by name. |
| `delete_bulk` | Delete multiple templates. Pass `names` array. Returns `{ deleted, not_found }`. |

## MCP Array Workaround

Some MCP clients (e.g. Claude Desktop) serialize nested arrays/objects as JSON strings instead of proper arrays. All tools that accept array parameters include a workaround:

```typescript
let list = rawParam as any;
if (typeof list === 'string') {
  try { list = JSON.parse(list); } catch { list = null; }
}
```

This applies to: `exercises`, `names`, `days`, `overrides`, `skip`, `tags`, `bulk`, `delete_sessions`, `exercises` (stats).

## Exercise Resolver Logic

```
1. Exact match on exercises.name (case-insensitive)
2. Exact match on exercise_aliases.alias (case-insensitive)
3. Partial match (ILIKE '%input%') on name or alias
4. If no match → auto-create the exercise
```

When auto-creating, optional `muscle_group`, `equipment`, `rep_type`, and `exercise_type` are stored if provided.

## Seed Data

### 16 Exercises (English canonical names with Spanish aliases)

| Name | Muscle Group | Equipment | Key Aliases |
|---|---|---|---|
| Bench Press | chest | barbell | press banca, press plano, bench |
| Incline Bench Press | chest | barbell | press inclinado, incline bench |
| Overhead Press | shoulders | barbell | press militar, ohp, press hombro |
| Dumbbell Lateral Raise | shoulders | dumbbell | elevaciones laterales, laterales |
| Tricep Pushdown | triceps | cable | tricep, pushdown, polea triceps |
| Cable Fly | chest | cable | cruces en polea, cable crossover, aperturas polea |
| Barbell Row | back | barbell | remo con barra, bent over row, remo |
| Pull-Up | back | bodyweight | dominadas, pullup, pull up |
| Face Pull | rear delts | cable | face pull, tirón a la cara |
| Barbell Curl | biceps | barbell | curl con barra, curl barra, bicep curl |
| Hammer Curl | biceps | dumbbell | curl martillo, hammer |
| Squat | quads | barbell | sentadilla, squat, sentadillas |
| Romanian Deadlift | hamstrings | barbell | peso muerto rumano, rdl, rumano |
| Leg Press | quads | machine | prensa, leg press, prensa de piernas |
| Leg Curl | hamstrings | machine | curl femoral, leg curl, femoral |
| Calf Raise | calves | machine | gemelos, calf raise, pantorrillas |

### Seeded PPL Program (v1)

**Push (Monday)**
1. Bench Press — 4x8
2. Overhead Press — 3x10
3. Incline Bench Press — 3x10
4. Dumbbell Lateral Raise — 3x15
5. Tricep Pushdown — 3x12
6. Cable Fly — 3x15

**Pull (Wednesday)**
1. Barbell Row — 4x8
2. Pull-Up — 3x10
3. Face Pull — 3x15
4. Barbell Curl — 3x10
5. Hammer Curl — 3x12

**Legs (Friday)**
1. Squat — 4x8
2. Romanian Deadlift — 3x10
3. Leg Press — 3x12
4. Leg Curl — 3x12
5. Calf Raise — 4x15

## Stats & Calculations

### Estimated 1RM (Epley Formula)
```
1RM = weight × (1 + reps / 30)
```

### Volume
```
session_volume = Σ (weight × reps) for all working sets
```
Warmup sets excluded.

### PR Detection
On every `log_exercise`, check and upsert (for `exercise_type = 'strength'` only):
- **max_weight**: heaviest weight for any rep count
- **max_reps_at_{weight}**: most reps at a specific weight
- **estimated_1rm**: highest calculated 1RM

PR history is stored in `pr_history` table for timeline queries.

## Bulk Operations Summary

| Tool | Bulk Actions |
|---|---|
| `manage_exercises` | `add_bulk`, `update_bulk`, `delete_bulk` |
| `manage_program` | `delete_bulk` |
| `manage_templates` | `delete_bulk` |
| `log_exercise` | `exercises` array (bulk logging) |
| `edit_log` | `bulk` array (multi-exercise edits), `delete_sessions` (bulk soft-delete) |
| `get_stats` | `exercises` array (multi-exercise stats) |

## Migrations History

| # | File | Description |
|---|---|---|
| 001 | `001_schema.sql` | Full schema: 11 tables + indexes |
| 002 | `002_seed.sql` | 16 exercises with aliases + PPL program |
| 003 | `003_fixes.sql` | Add Deadlift, normalize muscle groups |
| 004 | `004_rest_and_notes.sql` | rest_seconds, notes columns, session templates tables |
| 005 | `005_fix_seed_references.sql` | Fix seed data references |
| 006 | `006_multi_tenant.sql` | `users` table, add `user_id` FK to sessions, programs, personal_records, session_templates, user_profile |
| 007 | `007_fix_program_fk.sql` | FK ON DELETE SET NULL for sessions → program_versions/days |
| 008 | `008_features.sql` | `pr_history` table, `deleted_at` on sessions, `tags TEXT[]` on sessions (GIN index) |
| 009 | `009_improvements.sql` | `rep_type` + `exercise_type` columns on exercises with CHECK constraints |

## Deployment

### Local Development
```bash
cp .env.example .env
# Edit .env with your Neon DATABASE_URL + WorkOS keys
npm install
npm run dev      # Starts on http://localhost:3001
```

### Deploy to Cloud Run
```bash
gcloud run deploy gym-tracker \
  --source . \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-env-vars DATABASE_URL="postgresql://..." \
  --port 3001 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1
```

> **Note:** Cloud Run is configured with `--no-allow-unauthenticated`, requiring IAM auth for access.

### Connect to Claude
1. Go to Claude → Settings → Integrations → Add custom integration
2. URL: `https://gym-tracker-680099996238.us-central1.run.app/mcp`
3. Start chatting: "Hice peso muerto 100kg 5x5"

### Cost Breakdown

| Service | Free Tier | Monthly Cost |
|---|---|---|
| **Cloud Run** | 180k vCPU-sec, 2M requests | **$0** |
| **Neon Postgres** | 100 CU-hrs, 3GB storage | **$0** |
| **Total** | | **$0** |
