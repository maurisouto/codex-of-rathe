# Fragments of Rathe — technical guide

An experience built around FAB card puzzles in *fragment* and *sliding* modes. Fragments has its own routes, API, statistics, and leaderboards.

---

## Routes and navigation (web)

| Route | Purpose |
|-------|---------|
| `/puzzle` | Lobby and puzzle (`FragmentsPlayClient`) |
| `/puzzle/profile` | Your archive (authentication required) |
| `/puzzle/leaderboard` | Hall of records |
| `/u/[userId]/puzzle` | Public profile |

The header (`fragments-header.tsx`) links to Codex (`/`), Play (`/puzzle`), Hall of records, and **Your archive** (visible when signed in). Below the `md` breakpoint, a second row of links and `MobileNav` group links for Fragments and Codex.

The entry rail (`fragments-puzzle-entry-rail.tsx`) appears above the configuration panel during setup. It includes thematic copy, a brief profile preview for signed-in users, and links to the Hall of records and archive.

`getBrandFromPathname()` returns `"fragments"` for paths under `/puzzle` and `/u/.../puzzle`.

---

## API

`fragments-routes.ts` mounts the routes under `/api/fragments`.

### Completions

- `POST /completions` uses `parseFragmentsCompletionInput` to validate the request body.
- Completions persist for the `user` actor. The `guest` actor receives `{ persisted: false }`.
- The unique `runId` ensures idempotency. The same user can resubmit the completion.

### Profile

- `GET /profile/me` requires authentication.
- `GET /profile/:userId` is public.

The response includes `summary`, `recentCompletions`, `highlights`, `setProgress`, `modeBreakdown`, `difficultyBreakdown`, `cardHighlights`, and `bestRuns`, among other fields.

`getFragmentsProfileByUserId` in `fragments-service.ts` and helpers in `fragments-profile-aggregate.ts` perform the main aggregation. Set progress uses **`getPlayablePrintingCountBySet()`** from the catalog, which uses the same pool as the random deal.

### Leaderboards

- `GET /leaderboards?category=&mode=&difficulty=&limit=&offset=`

| `category` | Ranking |
|------------|---------|
| `fastest` | Best run by `timeMs`, with ties broken by moves and then `completedAt` |
| `fewest_moves` | Best run by `moves` |
| `most_restorations` | Users by count of completions matching the filters |
| `most_unique_cards` | Users by count of distinct `cardId` values |

Filters accept `all`, `fragments`, or `sliding` for `mode` and `all`, `easy`, `normal`, or `hard` for `difficulty`.

Minimum validation (v1) requires `timeMs` of 500 to 86,400,000 inclusive and `moves` of at least 1. These values come from the client and lack anti-cheat verification.

The implementation lives in `fragments-leaderboard-service.ts`.

---

## Persistence (Prisma)

- `FragmentsCompletion` stores one row per saved run.
- `UserFragmentsStat` stores per-user aggregates (counts, best results, totals).
- `UserFragmentsCardStat` stores statistics by `cardId`.

Redesigning these models requires an explicit migration and a data plan.

---

## Frontend features

```
apps/web/src/features/fragments/
  engine/          # Puzzle logic (fragment and sliding) and tests
  components/      # Puzzle UI, setup, leaderboard, HUD, etc.
  hooks/           # use-fragments-puzzle-game.ts (state and POST completion)
  lib/             # fragments-catalog.ts (deal a card via the catalog API)
```

The API client lives in `apps/web/src/lib/fragments/fragments-api.ts` and its types in `apps/web/src/lib/fragments/types.ts`.

---

## Product phases

| Phase | Status | Scope |
|-------|--------|-------|
| Gameplay and UI | Complete | Setup, modes, results, and persistence for signed-in users |
| 5 Persistence | Complete | POST completion, stats, and basic profiles |
| 5.5 Profile statistics | Complete | Set progress, highlights, and breakdowns |
| 6 Leaderboards | Complete | API and `/puzzle/leaderboard` |
| 6.5 Navigation | Complete | Header, entry rail, links between pages, and mobile navigation |
| 7+ (future) | — | Sharing, daily puzzles, server-side verification, etc. |

Read the phase brief before implementing a new phase and stay within its scope. Leaderboards, for example, are outside the scope of a statistics phase.

---

## Tests

- API: `fragments-service.test.ts`, `fragments-profile-aggregate.test.ts`, `fragments-leaderboard-service.test.ts`, `fragments-http.test.ts`, `fragments-leaderboards-http.test.ts`
- Web: `persistence-wiring.test.ts`, `fragments-navigation-wiring.test.ts`, `fragments-leaderboard-page-source.test.ts`, `engine/*.test.ts`

---

## Constraints for agents

- Leave the **Guess** leaderboard logic and `UserStat` intact.
- Keep Guess and Fragments rankings in separate interfaces.
- Keep statistics and navigation phases within their requested gameplay scope.
- Maintain the arcane green and archive aesthetic. Avoid esports dashboard styling.
