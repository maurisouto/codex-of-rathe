# Repository handoff — Guess a Card, Any Card

Start here when taking over development after a repository transfer. Read this guide before opening Cursor or deploying.

**Last updated:** June 2026, after *Fragments of Rathe* Phases 5.5–6.5.

---

## 1. Project overview

This npm monorepo contains **three experiences** under one account, using Supabase Auth when configured.

| Experience | Web routes | Brand (`experience-brand`) | Description |
|------------|------------|----------------------------|-------------|
| **Codex of Rathe** | `/`, `/profile`, `/u/[userId]` | `codex` | Hub linking to Guess and Fragments, with a global profile. |
| **Guess the Card** | `/guess`, `/single`, `/challenge`, `/coop`, `/competitive`, `/leaderboard`, `/stats`, … | `guess` | Guess obscured cards as they are revealed in stages. |
| **Fragments of Rathe** | `/puzzle`, `/puzzle/profile`, `/puzzle/leaderboard`, `/u/[userId]/puzzle` | `fragments` | Fragment and sliding puzzles featuring artwork from the FAB catalog. |

- **Web** — `apps/web` uses Next.js 16. Consult the agent instructions for the applicable Next.js APIs.
- **API** — `apps/api` uses Hono, Prisma 7, and PostgreSQL.
- **Shared** — `packages/shared` contains the reveal engine, co-op protocol, and types.

`initCardCatalog()` builds the card catalog in memory at API startup using `@flesh-and-blood/cards`. The database contains no `Puzzle` tables.

---

## 2. Quick start for a new environment

### Requirements

- Node **≥ 20.9**
- An accessible PostgreSQL instance (`DATABASE_URL`)
- Optional Supabase project (Auth and DB)

### Commands

```bash
git clone <repo-url>
cd guess-a-card-any-card
npm install
cp .env.example .env   # Set DATABASE_URL and any applicable Supabase settings
npm run db:deploy      # Apply migrations under apps/api/prisma
```

Use two terminals for local development.

```bash
# Terminal A — API (port 8787 by default)
npm run dev:api

# Terminal B — Web (automatically proxies /api to port 8787 in development)
npm run dev
```

- Check API health with `GET http://127.0.0.1:8787/api/health`.
- The web app needs the API to load live game data.

### Environment variables

Use the root **`.env.example`** as a template. The API also reads `apps/api/.env` if present.

| Variable | Where | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | API | PostgreSQL or Supabase |
| `SUPABASE_URL` / `SUPABASE_JWKS_URL` | API | Validate user JWTs |
| `NEXT_PUBLIC_SUPABASE_*` | Web | Browser sign-in |
| `CORS_ORIGIN` | Production API | Web app origin (Vercel) |
| `API_PROXY_TARGET` | Production web | API base URL without `/api` |
| `NEXT_PUBLIC_COOP_WS_URL` | Web | Optional override for the co-op WebSocket endpoint |

To enable **Sign in** on the hub during local development, set `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the root `.env` or `apps/web/.env.local`. Use the public
values from Supabase → Project Settings → API. The anon key may be exposed to the browser.
Never put a service-role key in a variable with the `NEXT_PUBLIC_` prefix. Restart Next.js
after changing public variables. For OAuth or magic links, register
`http://localhost:3000/auth/callback` under Authentication → URL Configuration and enable the
required providers.

See the [deployment guide](./deploy.md).

---

## 3. Architecture overview

```
apps/web (Next)  ──rewrite /api/*──►  apps/api (Hono :8787)
                                         │
                                         ├── Prisma → PostgreSQL
                                         └── In-memory FAB catalog (loaded at startup)
```

- **Guess leaderboard** uses `/api/leaderboard` and stays separate from Fragments.
- **Fragments** uses `/api/fragments/*` and has its own persistence and rankings.
- Guests use the `x-guest-id` header. Signed-in users use `Authorization: Bearer <jwt>`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full architecture map. The historical product
vision contains some outdated sections. For the current catalog model, section 0.1 takes precedence
over the historical puzzle database design. [BLUEPRINT_PRO.md](./BLUEPRINT_PRO.md)

---

## 4. Database and migrations

- This repository owns the migrations under `apps/api/prisma`.
- Run `npm run db:deploy` locally and during deployment to apply migrations.
- Run `npm run db:generate` to generate the client at `apps/api/src/generated/prisma`, which Git ignores.

Recent migrations relevant to Fragments:

- `20260509004000_fragments_persistence_stats` — completions and aggregated statistics.
- `20260509120000_fragments_leaderboard_indexes` — leaderboard indexes.

See the [database policy](./database.md).

An earlier README mentioned `image-guess-admin` sharing the database. The current policy and blueprint
section 0.1 place that admin outside gameplay and this database. If a legacy admin repository still exists,
it needs explicit agreement before applying independent migrations to the same database.

---

## 5. Fragments of Rathe — implementation status

Fragments has its own routes, API, leaderboards, and green archive-themed UI.

### Web routes

| Route | Main component |
|-------|----------------|
| `/puzzle` | `FragmentsPlayClient` with setup and gameplay |
| `/puzzle/profile` | `FragmentsProfilePageClient` |
| `/puzzle/leaderboard` | `FragmentsLeaderboardClient` — *Hall of records* |
| `/u/[userId]/puzzle` | `FragmentsPublicProfileClient` |

### API (`/api/fragments`)

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/completions` | Requires authentication to persist and uses `runId` for idempotency |
| GET | `/profile/me` | Requires authentication |
| GET | `/profile/:userId` | Public |
| GET | `/leaderboards` | Query parameters `category`, `mode`, `difficulty`, `limit`, and `offset` |

### Completed phases

| Phase | Scope |
|-------|-------|
| 5 | Completion persistence, `UserFragmentsStat`, and profiles |
| 5.5 | Expanded profile with a summary, breakdowns, progress by set, highlights, and recent activity |
| 6 | Leaderboards (`fastest`, `fewest_moves`, `most_restorations`, `most_unique_cards`) and filters |
| 6.5 | Navigation with Play, Hall of records, and Your archive in the header, an entry rail on `/puzzle`, and mobile navigation |

See the [Fragments technical guide](./FRAGMENTS.md).

### Pending Fragments features

- Server-side puzzle verification. Completions rely on the client as documented in `fragments-service.ts`.
- Share URLs, a daily puzzle, and multiplayer Fragments.
- Robust anti-cheat measures.

### UI terminology

- Use **restorations** and **restore** consistently in Fragments.
- **Hall of records** names the leaderboard page (`/puzzle/leaderboard`).
- **Your archive** names the signed-in profile page (`/puzzle/profile`).
- **Start puzzle** is the primary setup action.

---

## 6. Guess boundaries

- The Guess leaderboard uses `/leaderboard` on the web and `/api/leaderboard` on the API.
- Guess profile routes are `/guess/profile` and `/u/[id]/guess`.
- Keep Guess statistics and rankings separate when working on Fragments.

---

## 7. Testing

From the repository root, run the following.

```bash
npm test                    # Vitest for web, API, and shared (projects in vitest.config.ts)
```

Run `npx tsc --noEmit` separately in `apps/web` and `apps/api`.

Fragments wiring tests use `*-wiring.test.ts` and `*-source.test.ts` under
`apps/web/src/features/fragments/`. They run without React Testing Library.

---

## 8. Working with Cursor and agents

1. Read the [repository instructions](../AGENTS.md).
2. Before editing Next.js code, read the relevant Next.js 16 guides under `node_modules/next/dist/docs/`.
3. Keep changes minimal, follow neighboring patterns, and avoid over-engineering.
4. Follow [AGENTS.md](../AGENTS.md) for commit and PR authorization.
5. Follow the scope of each future Fragments phase. [Fragments technical guide](./FRAGMENTS.md)

---

## 9. Deployment checklist for new maintainers

1. Apply PostgreSQL migrations with `db:deploy` during the API build.
2. Configure the Render API with `DATABASE_URL`, `CORS_ORIGIN`, and Supabase JWKS when using authentication.
3. Set `API_PROXY_TARGET` on Vercel to point the web app at the API.
4. Configure the `.../auth/callback` URLs under Supabase Authentication.
5. After an API deployment, confirm that startup loaded the FAB catalog. A startup failure leaves cards unavailable.

---

## 10. Key files

| Area | Location |
|------|----------|
| API routes | `apps/api/src/server/http-app.ts` |
| Fragments service | `apps/api/src/server/services/fragments-service.ts` |
| Fragments leaderboards | `apps/api/src/server/services/fragments-leaderboard-service.ts` |
| FAB catalog | `apps/api/src/server/services/card-catalog-service.ts` |
| Brand by route | `apps/web/src/lib/experience-brand.ts` |
| Fragments header | `apps/web/src/components/layout/fragments-header.tsx` |
| Client puzzle engine | `apps/web/src/features/fragments/engine/` |
| Fragments API types | `apps/web/src/lib/fragments/types.ts` |
| Prisma schema | `apps/api/prisma/schema.prisma` |

---

## 11. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `/api/*` returns 404 in development | The API is down | Run `npm run dev:api` |
| Empty catalog or API crash | FAB filters or the package | Check startup logs and `card-catalog-service` |
| Migrations fail | `DATABASE_URL` uses a pooler | Use a direct Supabase connection (see `.env.example`) |
| Fragments completions do not persist | Guest actor or invalid JWT | Sign in and check the `Authorization` header |
| CORS error in production | Missing `CORS_ORIGIN` | Configure it on the API or use the Vercel proxy |
| Prisma client missing | Client generation has not run | Run `npm run db:generate` |

---

## 12. Suggested product follow-ups

1. **Fragments** — deep links from Hall of records to filters, the user's leaderboard position, and optional server-side puzzle verification.
2. **Guess** — follow the roadmap in [BLUEPRINT_PRO.md](./BLUEPRINT_PRO.md), with some modes already partially implemented.
3. **Auth** — align `users.id` with `auth.users.id` if discrepancies remain.
4. **Co-op WebSocket** — the Node API server handles HTTP and `/coop-ws` in the same process. HTTP polling remains the fallback.

---

## 13. Handoff and continuity

When receiving the repository:

1. Clone it, run `npm install`, configure `.env`, and run `npm run db:deploy`.
2. Read this guide, [FRAGMENTS.md](./FRAGMENTS.md), and [ARCHITECTURE.md](./ARCHITECTURE.md).
3. Run `npm test` and manually smoke-test `/`, `/puzzle`, `/puzzle/profile`, and `/puzzle/leaderboard`.
4. Review `git status`, open branches, and pending PRs from the previous team.

If the handoff includes secrets for Supabase, Render, or Vercel, rotate them outside Git and update them only in the hosting dashboards. Never commit `.env`.
