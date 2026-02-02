# Gym Tracker

MCP Server that turns Claude (or ChatGPT) into a gym training partner — log workouts, track progress, and manage programs through natural conversation in Spanish or English.

Built with Node.js + TypeScript, Express, PostgreSQL, and the [MCP Apps SDK](https://github.com/anthropics/model-context-protocol) for visual widgets.

## Quick Start

```bash
npm install && cd web && npm install && cd ..
cp .env.example .env          # add your Neon DATABASE_URL
DEV_USER_ID=1 npm run dev     # server on :3001
cd web && npm run dev:host    # widget test host on :5173
```

Migrations run automatically on startup.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with tsx |
| `npm run build` | Compile TypeScript |
| `npm run build:widgets` | Build widget HTML files |
| `npm test` | Run tests (tsc + vitest) |

## Connect

1. Claude → Settings → Integrations → Add custom integration
2. URL: `http://localhost:3001/mcp` (or your deployed URL)
3. Start chatting: "Hice peso muerto 100kg 5x5"

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — Full development context: architecture, 21 MCP tools, schema, auth, deployment
- **[web/README.md](web/README.md)** — Widget development: architecture, theming, component patterns
- **[docs/](docs/)** — Product specs: onboarding flow, user journeys, product description
