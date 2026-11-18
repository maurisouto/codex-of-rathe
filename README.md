# Guess a Card, Any Card

Monorepo for **Codex of Rathe** (hub), **Guess the Card** (veiled FAB card guessing), and **Fragments of Rathe** (card puzzles).  
Card content comes from **`@flesh-and-blood/cards`** via an in-memory catalog loaded at API startup.

> **New maintainer or Cursor workspace:** start with **[docs/HANDOFF.md](./docs/HANDOFF.md)** for the repository handoff, setup, and product map.
>
> Agents: **[AGENTS.md](./AGENTS.md)** · Architecture: **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** · Fragments: **[docs/FRAGMENTS.md](./docs/FRAGMENTS.md)**

## Monorepo

| Package | Role | Typical deployment |
|---------|------|----------------|
| `apps/web` | Next.js UI | **Vercel** |
| `apps/api` | Hono + Prisma + REST `/api/*` | **Render** |
| `packages/shared` | Shared types (reveal, co-op WS) | (no standalone deployment) |

Generated artifacts: **[docs/generated-files.md](./docs/generated-files.md)**.

## Experiences (main routes)

| Experience | Routes | API |
|-------------|-------|-----|
| Codex (hub) | `/`, `/profile`, `/u/[userId]` | `/api/profile`, … |
| Guess | `/guess`, `/single`, `/challenge`, `/coop`, `/competitive`, `/leaderboard`, `/stats` | `/api/single`, `/api/challenges`, `/api/leaderboard`, … |
| Fragments | `/puzzle`, `/puzzle/profile`, `/puzzle/leaderboard` | `/api/fragments/*` |

## Local setup

```bash
npm install
cp .env.example .env    # Set DATABASE_URL and configure Supabase if you use auth. See the file comments.
npm run db:deploy       # Apply migrations in the @gac/api workspace
```

### Local sign-in

The hub enables **Sign in** only when the frontend has `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` configured in the root `.env` or in
`apps/web/.env.local`. Use the project URL and the public **anon key** from
Supabase Dashboard → Project Settings → API. Never use a service-role key in the browser.

After changing these variables, restart `npm run dev`. For OAuth or magic links, add
`http://localhost:3000/auth/callback` in Supabase Dashboard → Authentication → URL Configuration
and enable the relevant providers.

**Frontend only** (game data requires the API):

```bash
npm run dev --workspace=@gac/web
```

**API and frontend** (recommended):

```bash
# Terminal A
npm run dev:api

# Terminal B
npm run dev
```

The API serves HTTP and the co-op WebSocket on the same process and port (`8787`). In
development, the client automatically uses `ws://<host>:8787/coop-ws`. Set
`NEXT_PUBLIC_COOP_WS_URL` only if the WebSocket runs on a different host. HTTP polling remains
available as a fallback.

In development, Next forwards `/api/*` to `http://127.0.0.1:8787` by default. Override the target with `API_PROXY_TARGET` in `apps/web/.env.local`.

The Prisma schema lives in `apps/api/prisma`. The generated client in `apps/api/src/generated/prisma` is ignored by Git. `prisma generate` can run without database access using `apps/api/prisma.config.ts`.

## Database & migrations

This repository is the **source of truth** for the game database’s Prisma migrations.

```bash
npm run db:deploy
```

See **[docs/database.md](./docs/database.md)** for the migration policy and runtime catalog model.

## Deploy

See **[docs/deploy.md](./docs/deploy.md)** for Vercel frontend hosting, the Render API, environment variables, and proxy setup.

## Root scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `dev:web` | Next in `apps/web` |
| `npm run dev:api` | Hono in `apps/api` (port 8787 or `PORT`) |
| `npm run build` / `start` | Build and `next start` for the web app |
| `npm run start:api` | Production API |
| `npm run lint` | ESLint for the web app |
| `npm test` | Vitest (web + api + shared) |
| `npm run db:*` | Prisma through the workspace `@gac/api` |
| `npm run realtime:dev` | Legacy standalone co-op WebSocket server (API workspace) |

## Documentation

| Document | Contents |
|-----------|-----------|
| [docs/HANDOFF.md](./docs/HANDOFF.md) | **Handoff and onboarding** |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Technical architecture |
| [docs/FRAGMENTS.md](./docs/FRAGMENTS.md) | Fragments of Rathe |
| [docs/BLUEPRINT_PRO.md](./docs/BLUEPRINT_PRO.md) | Product vision (§0.1 describes the current model) |
| [docs/deploy.md](./docs/deploy.md) | Hosting |
| [docs/database.md](./docs/database.md) | Postgres and migrations |
| [AGENTS.md](./AGENTS.md) | Instructions for Cursor and other agents |

## Learn more

- [Next.js Documentation](https://nextjs.org/docs) — this project uses **Next 16**. See also `node_modules/next/dist/docs/`.
