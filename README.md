# Gym Tracker

MCP Server that turns Claude into a gym training partner — log workouts, track progress, and manage programs through natural conversation.

## Features

- **12 MCP tools** for full workout lifecycle (exercises, programs, sessions, stats, templates)
- **Multi-tenant** with OAuth 2.1 authentication (WorkOS)
- **Bulk operations** on exercises, programs, templates, sessions, and stats
- **PR tracking** with Epley 1RM estimation and full PR history timeline
- **Session tags**, soft delete, and restore
- **Exercise types** (strength/mobility/cardio/warmup) with configurable rep types (reps/seconds/meters/calories)

## Prerequisites

- Node.js 22+
- PostgreSQL (or [Neon](https://neon.tech) serverless Postgres)

## Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL (+ WORKOS_* keys for auth)
npm install
npm run dev
```

The server starts on `http://localhost:3001`. Migrations run automatically on startup.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with tsx |
| `npm run build` | Compile TypeScript |
| `npm run serve` | Run compiled JS (production) |
| `npm run migrate` | Run migrations standalone |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Connect to Claude

1. Go to Claude → Settings → Integrations → Add custom integration
2. URL: `http://localhost:3001/mcp` (or your deployed URL)
3. Start chatting: "Hice peso muerto 100kg 5x5"

## Architecture

```
Claude → HTTPS → Cloud Run (Express + MCP SDK) → Neon Postgres
```

Auth: WorkOS OAuth 2.1 → Bearer token → AsyncLocalStorage per-request user isolation.

See [CLAUDE.md](./CLAUDE.md) for detailed architecture, schema, tools reference, and code patterns.
