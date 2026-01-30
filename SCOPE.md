# Gym Tracker — MCP Server

## Vision

An MCP Server that turns Claude into a gym training partner. The user talks naturally — "hice peso muerto 100kg 5x5", "hice la rutina de push", "cuanto levante en banca la semana pasada?" — and Claude logs, queries, and analyzes workout data automatically.

**Conversational (MCP Tools)** — The user talks to Claude, Claude calls tools. Works on mobile, desktop, anywhere Claude runs.

**Priority: conversational flow above everything else.** The tools must be designed so Claude can interpret natural language and map it to the right operations without friction.

## Status

- **Phase 1: Complete** — MCP Server deployed and functional
- **Phase 2: Pending** — Polish (better error messages, edge cases, exports, fuzzy matching)

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
6. **Workout sessions** — Group exercises per gym visit.
7. **Programs with versioning** — Multi-day programs (PPL, Upper/Lower) with automatic version history on every change.
8. **Edit/delete** — "No, eran 80kg no 100" works.
9. **Progress stats** — PR tracking, volume over time, estimated 1RM.

### What we skip (for now)

- Nutrition tracking
- Body measurements / body composition
- Social features
- Cardio (treadmill, cycling) — focus on strength training
- Rest timers
- AI-generated programs

## Architecture

### Stack
- **Runtime**: Node.js + TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk` (StreamableHTTP transport)
- **Database**: PostgreSQL on [Neon](https://neon.tech) (serverless, scales to zero)
- **SQL**: `pg` (node-postgres) with raw SQL
- **HTTP**: Express (serves MCP endpoint)
- **Server Run**: `tsx` (dev + production via Dockerfile)
- **Deploy**: Google Cloud Run (scales to zero, free tier)

### Infrastructure

```
Claude (mobile/web/desktop)
    │
    ▼  HTTPS
Google Cloud Run                ←── Scales to zero, free tier
  gym-tracker container
  (Node.js + Express)
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
├── .env                      # DATABASE_URL (local dev, gitignored)
├── .env.example
├── README.md                 # Quickstart guide
├── SCOPE.md
├── server.ts                 # Express + MCP server + tool registration
├── src/
│   ├── db/
│   │   ├── connection.ts     # pg Pool with SSL
│   │   ├── migrate.ts        # Standalone migration runner (npm run migrate)
│   │   ├── run-migrations.ts # Importable migration function (used by server.ts on startup)
│   │   └── migrations/
│   │       ├── 001_schema.sql          # Full schema (11 tables + indexes)
│   │       ├── 002_seed.sql            # 16 exercises with aliases + PPL program
│   │       ├── 003_fixes.sql           # Schema fixes
│   │       ├── 004_rest_and_notes.sql  # Added rest_seconds + notes columns
│   │       └── 005_fix_seed_references.sql  # Fixed seed data references
│   ├── tools/
│   │   ├── profile.ts        # manage_profile (get/update JSONB)
│   │   ├── exercises.ts      # manage_exercises (list/search/add/update/delete)
│   │   ├── programs.ts       # manage_program (list/get/create/update/activate/delete/history)
│   │   ├── session.ts        # start_session + end_session
│   │   ├── log-exercise.ts   # log_exercise (auto-session, auto-create, PR check)
│   │   ├── log-routine.ts    # log_routine (log full day with overrides/skips)
│   │   ├── history.ts        # get_history (period/exercise/day filters)
│   │   ├── stats.ts          # get_stats (PRs, progression, volume trends)
│   │   ├── edit-log.ts       # edit_log (update/delete sets)
│   │   └── templates.ts      # manage_templates (save/list/start/delete)
│   └── helpers/
│       ├── exercise-resolver.ts  # Fuzzy match: exact → alias → ILIKE → auto-create
│       ├── stats-calculator.ts   # E1RM (Epley), volume calc, PR detection + upsert
│       └── program-helpers.ts    # Version cloning, day inference, active program lookup
```

## Database Schema

### Model Conceptual

```
user_profile (singleton, JSONB)
exercises → exercise_aliases
programs → program_versions → program_days → program_day_exercises
sessions → session_exercises → sets
personal_records
session_templates → session_template_exercises
```

### Key Design: Program Versioning

Programs are multi-day routines (PPL, Upper/Lower, etc.) with automatic versioning:

1. User: "Creame una rutina PPL para lunes, miércoles y viernes"
   → `programs` + `program_versions` v1 + 3 `program_days` + exercises

2. User: "Sacá aperturas del día push y poné cruces en polea"
   → `program_versions` v2 (new version with the change)
   → v1 stays intact for history

3. User: "¿Cómo era mi rutina hace 2 meses?"
   → Query `program_versions` by date

### Tables

```sql
-- USER PROFILE (singleton, JSONB flexible storage)
user_profile (id, data JSONB, updated_at)

-- EXERCISES
exercises (id, name UNIQUE, muscle_group, equipment, created_at)
exercise_aliases (id, exercise_id FK, alias UNIQUE)

-- PROGRAMS (multi-day routines with versioning)
programs (id, name UNIQUE, description, is_active, created_at)
program_versions (id, program_id FK, version_number, change_description, created_at)
  UNIQUE(program_id, version_number)
program_days (id, version_id FK, day_label, weekdays INTEGER[], sort_order)
program_day_exercises (id, day_id FK, exercise_id FK, target_sets, target_reps,
  target_weight, target_rpe, sort_order, superset_group, rest_seconds, notes)

-- SESSIONS
sessions (id, started_at, ended_at, program_version_id FK, program_day_id FK, notes)
session_exercises (id, session_id FK, exercise_id FK, sort_order, superset_group,
  rest_seconds, notes)
sets (id, session_exercise_id FK, set_number, set_type, reps, weight, rpe, completed,
  notes, logged_at)

-- PERSONAL RECORDS (denormalized, upserted on log)
personal_records (id, exercise_id FK, record_type, value, achieved_at, set_id FK)
  UNIQUE(exercise_id, record_type)

-- TEMPLATES (reusable session blueprints)
session_templates (id, name UNIQUE, source_session_id FK, created_at)
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
| **weekdays INTEGER[]** | ISO weekdays (1=Mon..7=Sun) as Postgres array. Enables day-of-week inference. |

## MCP Tools (11 total)

### 1. `manage_profile`
Manage user profile data (JSONB). Claude calls `get` at conversation start for context.

```
Input: { action: "get" | "update", data?: object }
Output: { profile: {...} }
```

### 2. `manage_exercises`
List, search, add, update, or delete exercises with aliases.

```
Input: {
  action: "list" | "add" | "search" | "update" | "delete",
  name?, muscle_group?, equipment?, aliases?, hard_delete?
}
Output: { exercises: [...] } | { exercise, is_new } | { updated } | { deleted, warning? }
```

- `list`: List all exercises, optionally filtered by `muscle_group`.
- `search`: Search exercises by name/alias (fuzzy ILIKE).
- `add`: Add a new exercise with optional aliases, muscle_group, equipment.
- `update`: Update `muscle_group` and/or `equipment` of an existing exercise by name.
- `delete`: Permanently delete an exercise. Requires `hard_delete=true`. Cascade deletes aliases; sets personal_records FK to NULL.

### 3. `manage_program`
Full program CRUD with automatic version history.

```
Input: {
  action: "list" | "get" | "create" | "update" | "activate" | "delete" | "history",
  name?, description?,
  days?: [{ day_label, weekdays?, exercises: [{ exercise, sets, reps, weight?, rpe?, superset_group?, rest_seconds?, notes? }] }],
  change_description?, hard_delete?
}
Output: { program, version? }
```

- `create`: Creates program + v1 + days + exercises. Deactivates other programs.
- `update`: Creates new version with full days array + `change_description`.
- `activate`: Set program as active (deactivates all others).
- `delete`: Soft delete (deactivate). With `hard_delete=true`: permanent removal of program + all versions/days/exercises.
- `history`: Lists all versions with dates and change descriptions.

### 4. `start_session`
Start a workout. Infers program day from weekday if not specified.

```
Input: { program_day?, notes? }
Output: {
  session_id, started_at,
  program_day?: { label, exercises },
  last_workout?: { date, exercises: [{ name, sets, summary }] }
}
```

Returns `last_workout` with per-exercise set summaries from the previous session on the same program day (useful for weight reference).

### 5. `end_session`
End active session with summary and comparison.

```
Input: { notes?, force?: boolean }
Output: {
  session_id, duration_minutes, exercises_count, total_sets, total_volume_kg,
  exercises, supersets?,
  comparison?: { vs_last, volume_change, exercise_changes }
}
```

- `force`: Close session even if no exercises are logged (defaults to false — warns if empty).
- `comparison`: Volume change % and per-exercise weight changes vs the previous session on the same program day.

### 6. `log_exercise`
Log sets for an exercise. Auto-creates session and exercise if needed.

```
Input: {
  exercise, sets, reps (number | number[]), weight?, rpe?,
  set_type? ("warmup"|"working"|"drop"|"failure"),
  notes?, rest_seconds?, superset_group?,
  muscle_group?, equipment?, set_notes?, drop_percent?,
  exercises?: ExerciseEntry[]  // bulk mode
}
Output: { exercise_name, is_new_exercise, session_id, logged_sets, new_prs?, rest_seconds?, rest_reminder? }
```

- `reps` as array: per-set reps, e.g. `[10, 8, 6]` for 3 sets.
- `drop_percent`: auto-decreases weight per set (e.g. 100kg with 10% → 100, 90, 80...).
- `exercises` (bulk mode): array of exercise entries to log multiple exercises in one call.

Natural language examples:
- "Hice peso muerto 100kg 5x5" → `{ exercise: "peso muerto", sets: 5, reps: 5, weight: 100 }`
- "3 series de dominadas: 10, 8, 6" → `{ exercise: "dominadas", sets: 3, reps: [10, 8, 6] }`
- "Press banca 80kg 4x8, RPE 8" → `{ exercise: "press banca", sets: 4, reps: 8, weight: 80, rpe: 8 }`

### 7. `log_routine`
Log an entire program day at once with optional overrides/skips.

```
Input: { program_day?, overrides?: [{ exercise, sets?, reps?, weight?, rpe? }], skip?: string[] }
Output: { session_id, day_label, exercises_logged, total_sets, total_volume_kg, new_prs? }
```

### 8. `get_history`
Query workout history with filters.

```
Input: { period?: "today" | "week" | "month" | "year" | number, exercise?, program_day? }
Output: { sessions: [...], summary: { total_sessions, total_volume_kg, exercises_count } }
```

### 9. `get_stats`
Exercise statistics with progression tracking.

```
Input: { exercise, period?: "month" | "3months" | "year" | "all" }
Output: { exercise, personal_records, progression, volume_trend, frequency }
```

### 10. `edit_log`
Edit or delete previously logged sets.

```
Input: { exercise, session?: "today" | "last" | date, action: "update" | "delete", updates?, set_numbers? }
Output: { exercise, sets_updated, updated_sets } | { deleted, exercise, set_numbers }
```

### 11. `manage_templates`
Manage session templates — save a workout as a reusable template or start a session from one.

```
Input: { action: "save" | "list" | "start" | "delete", name?, session_id? ("last" | number) }
Output: { templates } | { template, exercises_count, source_session_id } | { session_id, started_at, template, planned_exercises } | { deleted }
```

- `save`: Save a completed session as a template. Pass `session_id` (or `"last"` for the most recent ended session) and a `name`.
- `list`: List all saved templates with their exercises.
- `start`: Start a new session pre-populated from a template (exercises only, no sets — use `log_exercise` to fill them in). Errors if an active session exists.
- `delete`: Delete a template by name.

## Exercise Resolver Logic

```
1. Exact match on exercises.name (case-insensitive)
2. Exact match on exercise_aliases.alias (case-insensitive)
3. Partial match (ILIKE '%input%') on name or alias
4. If no match → auto-create the exercise
```

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
On every `log_exercise`, check and upsert:
- **max_weight**: heaviest weight for any rep count
- **max_reps_at_{weight}**: most reps at a specific weight
- **estimated_1rm**: highest calculated 1RM

## Implementation Phases

### Phase 1: Core (COMPLETE)
- [x] Project setup (package.json, tsconfig, Dockerfile)
- [x] Neon Postgres setup + connection pool + SSL
- [x] Database migrations + seed data (16 exercises, PPL program)
- [x] Exercise resolver with aliases (exact → alias → ILIKE → auto-create)
- [x] Stats calculator (E1RM, volume, PR detection)
- [x] Program helpers (version cloning, day inference)
- [x] Express server with StreamableHTTP transport
- [x] All 11 MCP tools implemented and tested
- [x] Migrations run on server startup
- [x] Deployed to Cloud Run
- [x] Health check endpoint

### Phase 2: Polish — PENDING
- [ ] Better error messages in Spanish
- [ ] Handle edge cases (no active session, duplicate exercises)
- [ ] Export data (CSV)
- [ ] `pg_trgm` extension for better fuzzy matching

## Deployment

### Local Development
```bash
cp .env.example .env
# Edit .env with your Neon DATABASE_URL
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
