# Gym Tracker

MCP Server that turns Claude into a gym training partner — log workouts, track progress, and manage programs through natural conversation.

## Prerequisites

- Node.js 22+
- PostgreSQL (or [Neon](https://neon.tech) serverless Postgres)

## Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
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

See [SCOPE.md](./SCOPE.md) for architecture details, schema, and tool documentation.
