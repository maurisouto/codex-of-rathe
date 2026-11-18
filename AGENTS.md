# Agent instructions — Guess a Card, Any Card

Read this file before making changes. **`CLAUDE.md`** points here.

## Onboarding (new maintainer or new Cursor workspace)

1. **[docs/HANDOFF.md](./docs/HANDOFF.md)** — primary repository handoff, setup, Fragments and Guess, and checklist.
2. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — monorepo, routes, catalog, auth.
3. **[docs/FRAGMENTS.md](./docs/FRAGMENTS.md)** — Fragments API, phases, files, constraints.

## Repository language

Write versioned deliverables in English, including documentation, code, comments, configuration, instructions, and project-authored text. Requests may arrive in any language. Preserve proper names and established contracts.

## Agent team

The lead agent coordinates the work. The Codex profiles in `.codex/agents/` are `product` for scope and acceptance criteria, `development` for implementation, and `review` for verification. Delegate when the task warrants it and request an independent review when it adds value. Include the affected experience, scope, and expected outcome in each assignment.

When resuming a task, read the referenced issue or PR, confirm the branch, and inspect the working tree. When handing off work, record the branch, base commit, relevant changes, verification, blockers, and next step in the issue or PR if authorized. If the task has no shared record yet, use `docs/STATUS.md` as a local handoff note. Identify uncommitted changes and follow the repository's commit rules.

### Herdr coordination

In the local Herdr workspace, the coordinator assigns work to the Codex panels `rathe-producto`, `rathe-desarrollo`, and `rathe-revision` using `herdr agent prompt`. Use `herdr agent list` to confirm the panel and `herdr agent read` to read its response. Include the objective and issue or PR reference in each assignment, and record the outcome and next step so another session can resume the work.

When a Development PR is ready or a correction is pushed for another review, Development requests review with `herdr agent prompt rathe-revision` as part of the handoff. Include the PR URL, head SHA, scope, and verification performed. If the panel is busy or disconnected, or submission fails, report those details to the coordinator with the status **review pending**. The coordinator sends the request when the panel is available or assigns it to a subagent in the current session if authorized. Before resending a request, confirm whether it was already delivered for that SHA.

### Commits, PRs, and review

- Development may create a branch for an assigned implementation task, commit the task changes, push the branch, and open or update its PR. The PR must state the scope, verification, and outstanding work. Access depends on the session's credentials and permissions.
- A reviewer other than the author reviews the diff and verification. The reviewer reports **ready to merge**, **changes required**, or **review incomplete** to the coordinator with evidence and blockers. If the diff changes, review the affected parts again.
- The agent provides a technical verdict. Formal GitHub approval requires an authorized identity other than the PR author. The coordinator shares the verdict so an eligible reviewer can approve in GitHub.
- Merging and deploying require explicit authorization. GitHub branch protection rules apply as configured for the repository.

## Next.js (required)

This is **not** classic Next.js 14. APIs and conventions may differ.

Before writing or changing Next code, read the relevant guide under:

`node_modules/next/dist/docs/`

Heed deprecation notices in the codebase.

## Monorepo

| Package | Role |
|---------|------|
| `apps/web` | Next.js UI (`@gac/web`) |
| `apps/api` | Hono + Prisma (`@gac/api`), port 8787 default |
| `packages/shared` | Shared types, reveal, coop protocol (`@gac/shared`) |

Local dev: **`npm run dev:api`** + **`npm run dev`** (web proxies `/api` to API in development).

## Product boundaries (do not blur)

- **Codex** — hub `/`, global profile `/profile`.
- **Guess** — veiled card guessing; leaderboard at `/leaderboard` and `/api/leaderboard`.
- **Fragments** — puzzles at `/puzzle/*`; API `/api/fragments/*`; **separate** leaderboards and stats.

When a task says “Fragments only”, do **not** change Guess leaderboard, Guess profile stats, or Codex-wide rankings.

## Database

- Migrations live in **`apps/api/prisma`** only.
- Apply: `npm run db:deploy` from repo root.
- Card data comes from **`@flesh-and-blood/cards`** at API boot — not from puzzle tables.

See [docs/database.md](./docs/database.md).

## Code style (user rules)

- **Minimal diffs** — fix what was asked; no drive-by refactors.
- **Match surrounding code** — naming, imports, patterns in neighboring files.
- **Avoid over-engineering** — no extra abstractions for one-off logic.
- **Comments** only for non-obvious business rules.
- **Tests** when they add real coverage; skip trivial assertions.
- **Commits** are authorized for Development on assigned implementation tasks as described above. Other commits require an explicit user request.

## Commands

```bash
npm install
npm run dev:api          # API
npm run dev              # Web
npm test                 # vitest (web + api + shared)
npm run db:deploy        # migrations
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit
```

## Fragments terminology (UI copy)

Prefer: **restoration(s)**, **Hall of records**, **Your archive**, **Start puzzle**, **Return to restorations**.

Avoid mixing puzzle / game / run / match inconsistently in Fragments surfaces.

## Phase work (Fragments)

If the user references “Phase N”, read [docs/FRAGMENTS.md](./docs/FRAGMENTS.md) for scope. Typical out-of-scope items unless requested: Guess changes, leaderboard merge, persistence redesign, server-side puzzle verification, share system, daily puzzle.

## Deploy / env

Template: `.env.example`. Hosting: [docs/deploy.md](./docs/deploy.md).
