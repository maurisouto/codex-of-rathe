# Agent instructions — Guess a Card, Any Card

Read this file before making changes. **`CLAUDE.md`** points here.

## Onboarding (new maintainer or new Cursor workspace)

1. **[docs/HANDOFF.md](./docs/HANDOFF.md)** — traspaso del repo, setup, Fragments vs Guess, checklist (Spanish, primary).
2. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — monorepo, routes, catalog, auth (English).
3. **[docs/FRAGMENTS.md](./docs/FRAGMENTS.md)** — Fragments API, phases, files, constraints.

## Equipo de agentes

El agente principal coordina el trabajo. Los perfiles de Codex en `.codex/agents/` son `product` para alcance y criterios de aceptación, `development` para implementación y `review` para verificación. Delega cuando la tarea lo amerite y pide una revisión independiente cuando aporte valor. Cada encargo debe incluir la experiencia afectada, el alcance y el resultado esperado.

Para retomar una tarea, lee primero la referencia del issue o PR, comprueba la rama y revisa el estado del árbol de trabajo. Al entregar el trabajo, registra la rama, el commit base, cambios relevantes, verificaciones, bloqueos y próximo paso en el issue o PR si está autorizado. Si la tarea todavía no tiene un registro compartido, usa `docs/STATUS.md` como nota de continuidad local. Identifica los cambios pendientes de commit y respeta la regla de commits de este repositorio.

### Coordinación visible en Herdr

En el workspace local de Herdr, el coordinador asigna tareas a los paneles Codex `rathe-producto`, `rathe-desarrollo` y `rathe-revision` con `herdr agent prompt`. Usa `herdr agent list` para confirmar el panel y `herdr agent read` para consultar su respuesta. Incluye el objetivo y la referencia del issue o PR en cada encargo, y registra el resultado y el próximo paso para poder retomar desde otra sesión.

Cuando un PR de Desarrollo queda listo, o se sube una corrección que necesita otra pasada, Desarrollo solicita revisión como parte de la entrega mediante `herdr agent prompt rathe-revision`. Envía el enlace al PR, el SHA del head, el alcance y las verificaciones ejecutadas. Si el panel está ocupado, desconectado o el envío falla, entrega estos datos al coordinador con el estado **revisión pendiente**. El coordinador envía la solicitud al panel cuando esté disponible o encarga la revisión a un subagente en la sesión actual si está autorizado. Antes de reenviar una solicitud, confirma si ya se entregó para ese SHA.

### Commits, PRs y revisión

- El agente de Desarrollo puede crear una rama para una tarea de implementación asignada, hacer commits de esa tarea, subir la rama y abrir o actualizar su PR. El PR debe indicar el alcance, las verificaciones y lo pendiente. El acceso efectivo depende de las credenciales y permisos de la sesión.
- Un agente de Revisión distinto del autor revisa el diff y las verificaciones. Devuelve al coordinador un dictamen de **apto para merge**, **requiere cambios** o **revisión incompleta**, con la evidencia y los bloqueos. Si cambia el diff, revisa de nuevo lo afectado.
- El visto bueno del agente es técnico. Una aprobación formal en GitHub requiere una identidad autorizada distinta de la que abrió el PR. El coordinador comparte el dictamen para que un revisor habilitado pueda aprobar en GitHub.
- El merge y el despliegue requieren autorización explícita. Las reglas de protección de ramas de GitHub se aplican según la configuración del repositorio.

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
