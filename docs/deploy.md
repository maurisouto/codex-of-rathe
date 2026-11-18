# Deploying the game (Vercel + Render)

The repository is an **npm monorepo**.

| Package | Role | Typical deployment |
|---------|------|--------------------|
| `apps/web` | Next.js (UI) | **Vercel** |
| `apps/api` | Hono + Prisma + Postgres | **Render** (long-running Node process) |
| `packages/shared` | Shared types and co-op WebSocket protocol | Deployed with dependent apps |

See [generated-files.md](./generated-files.md) for which generated artifacts to exclude from Git and Vercel.

The Node API on **Render** serves the HTTP routes (`/api/*`) and the co-op WebSocket (`/coop-ws`) in the same process.

## 1. API on Render

1. Create a **Web Service**, connect this repository, and use the **repository root**. Commands that target a workspace can run from the root.
2. Set the **Build Command** to `npm ci && npm run db:deploy --workspace=@gac/api`.
3. Set the **Start Command** to `npm run start:api` (equivalent to running `tsx src/index.ts` in `apps/api`).
4. Configure these environment variables.
   - **`DATABASE_URL`** points to the game's Postgres database. Migrations live in `apps/api/prisma`.
   - **`PORT`** is optional. Render injects it, and the app uses `process.env.PORT ?? 8787`.
   - **`CORS_ORIGIN`** lists the explicit production frontend origins, such as `https://your-project.vercel.app`, without trailing slashes. Separate multiple origins with commas. The wildcard `*` is disallowed.
   - **`COOP_REALTIME_NOTIFY_URL`** and **`COOP_REALTIME_SECRET`** apply only to the legacy standalone process. The unified Node API on Render runs without a separate notification URL.

After deployment, check `GET https://<your-service>.onrender.com/api/health`.

## 2. Frontend on Vercel

1. Import the repository and set the project **Root Directory** to the **monorepo root**, which contains the `package.json` with `workspaces`.
2. Set the **Build Command** to `npm run build --workspace=@gac/web`. If you copy `apps/web/vercel.json` to the root, you can use the default build command. Keep the monorepo root as the project context.
3. Run `npm ci` from the root to install the workspaces.
4. Configure these environment variables.
   - **`API_PROXY_TARGET`** is the public API base URL without the `/api` path, such as `https://gac-api.onrender.com`. Next.js rewrites same-origin `/api/*` requests to that host so the browser avoids cross-origin requests.
   - **`NEXT_PUBLIC_COOP_WS_URL`** is optional. Set it to the Node API's `wss://.../coop-ws` endpoint if the WebSocket uses a different origin from the frontend.

Without `API_PROXY_TARGET`, frontend `/api/*` routes reach the API only when both run in a single process.

## 3. Local development

Start the API in terminal 1. The default port is 8787.

```bash
cd apps/api && cp ../../.env .env   # Or use a symlink. DATABASE_URL is required.
npm run dev
```

To run the web app with the API proxy in terminal 2, set the following in `apps/web/.env.local`.

```env
API_PROXY_TARGET=http://127.0.0.1:8787
```

```bash
npm run dev --workspace=@gac/web
```

`npm run dev:api` serves HTTP and `/coop-ws` together, so the standard setup uses two terminals.
`npm run realtime:dev` remains available as a legacy standalone process for hosts that require separate HTTP and WebSocket processes.

## 4. Database and catalog

- Migrations live in **`apps/api/prisma`**. Run `db:deploy` in the Render build or run it manually beforehand.
- Set **`DATABASE_SSL_REJECT_UNAUTHORIZED=false`** in the API if Supabase or another pooler reports TLS errors (`P1010`).
- The API loads the **card catalog** (`@flesh-and-blood/cards`) **into memory at startup**. Redeploy or restart to refresh sets and the playable card pool. This requires no puzzle publication or admin synchronization.
- If the catalog fails to load at startup, treat gameplay flows as unhealthy in operational checks.

## 5. Checklist

- [ ] `DATABASE_URL` is set in Render for build and runtime.
- [ ] `API_PROXY_TARGET` in Vercel points to the public API.
- [ ] `CORS_ORIGIN` in the API includes the frontend domain (recommended in production).
- [ ] The API starts and responds, for example at `/api/health`. The catalog loads on startup.
