import { Hono, type Context } from "hono";
import { RequestIdentityError } from "@/server/auth/request-identity-error";
import { resolveActorFromRequest } from "@/server/auth/resolve-actor";
import { createRunesRun, applyRunesAction, snapshotRun, RunesError, type RunesAction, type RunesMode, type RunesRunState } from "./runes-game";
import { loadRunesArtworkPool, loadRunesTutorialPoolCached } from "./runes-pool";
import { createStoredRun, getCurrentRun, getOwnedRun, saveRunRevision } from "./runes-store";
import { getRuneLeaderboard, getRuneStats, recordRuneResult } from "./runes-results";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownerFor(actor: { kind: "user"; userId: string } | { kind: "guest"; guestId: string }) {
  return actor.kind === "user"
    ? { ownerKey: `user:${actor.userId}`, userId: actor.userId }
    : { ownerKey: `guest:${actor.guestId}`, userId: null };
}

async function optionalUserId(headers: Headers) {
  if (!headers.has("authorization") && !headers.has("x-guest-id")) return null;
  const actor = await resolveActorFromRequest(headers);
  return actor.kind === "user" ? actor.userId : null;
}

function errorResponse(error: unknown, c: Context) {
  if (error instanceof RequestIdentityError) return c.json({ error: error.message }, error.status as 401 | 400 | 404 | 409 | 503);
  if (error instanceof RunesError) return c.json({ error: error.message }, error.status);
  throw error;
}

function parseAction(value: unknown): RunesAction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.requestId !== "string" || !REQUEST_ID.test(row.requestId)) return null;
  if (row.action === "ready" || row.action === "ack") return { action: row.action, requestId: row.requestId };
  if (row.action === "reveal" && Number.isInteger(row.expectedCluesRevealed) && (row.expectedCluesRevealed as number) >= 0) {
    return { action: "reveal", requestId: row.requestId, expectedCluesRevealed: row.expectedCluesRevealed as number };
  }
  if (row.action === "confirm" && typeof row.artworkId === "string" && REQUEST_ID.test(row.artworkId)) {
    return { action: "confirm", requestId: row.requestId, artworkId: row.artworkId };
  }
  return null;
}

async function resolveResult(state: RunesRunState) {
  const snapshot = snapshotRun(state);
  if ((state.status === "complete" || state.status === "closed") && state.mode === "ranked" && state.userId && state.terminal) {
    await recordRuneResult(state.runId, state.userId, state.terminal.outcome, state.revealed, state.terminal.elapsedMs);
    const leaderboard = await getRuneLeaderboard(state.userId);
    if ("result" in snapshot) return { ...snapshot, result: { ...snapshot.result, personalBest: leaderboard.personalBest, recorded: true } };
  }
  if ("result" in snapshot) return { ...snapshot, result: { ...snapshot.result, personalBest: null, recorded: false } };
  return snapshot;
}

async function mutateOwnedRun(runId: string, ownerKey: string, action: RunesAction) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await getOwnedRun(runId, ownerKey);
    const state = record?.state;
    if (!record || !state) throw new RunesError(404, "Read the Runes round was not found.");
    if (state.status === "complete" || state.status === "closed") {
      if (action.action !== "ack") {
        if (state.actionSnapshots[action.requestId]) return resolveResult(state);
        throw new RunesError(409, "This Read the Runes round is already complete.");
      }
      const wasClosed = state.status === "closed";
      const result = applyRunesAction(state, action);
      if (wasClosed) return result;
      if (await saveRunRevision(state, record.revision)) return result;
      continue;
    }
    const result = applyRunesAction(state, action);
    if (await saveRunRevision(state, record.revision)) {
      return (state as RunesRunState).status === "complete" ? resolveResult(state) : result;
    }
  }
  const latest = await getOwnedRun(runId, ownerKey);
  if (latest?.state?.status === "complete") return resolveResult(latest.state);
  throw new RunesError(409, "The round changed in another request. Retry the same action.");
}

export function createRunesRoutes() {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.get("/leaderboard", async (c) => {
    try { return c.json(await getRuneLeaderboard(await optionalUserId(c.req.raw.headers))); }
    catch (error) { return errorResponse(error, c); }
  });
  routes.get("/stats", async (c) => {
    try { return c.json(await getRuneStats(await optionalUserId(c.req.raw.headers))); }
    catch (error) { return errorResponse(error, c); }
  });
  routes.get("/runs", async (c) => {
    try {
      const actor = await resolveActorFromRequest(c.req.raw.headers);
      const { ownerKey } = ownerFor(actor);
      const current = await getCurrentRun(ownerKey);
      if (!current?.state) return c.json({ error: "No active Read the Runes round." }, 404);
      return c.json(await resolveResult(current.state));
    } catch (error) { return errorResponse(error, c); }
  });
  routes.post("/runs", async (c) => {
    try {
      const actor = await resolveActorFromRequest(c.req.raw.headers);
      const owner = ownerFor(actor);
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const mode: RunesMode = body.mode === "tutorial" ? "tutorial" : "ranked";
      const pool = mode === "tutorial" ? loadRunesTutorialPoolCached() : loadRunesArtworkPool();
      const state = createRunesRun({ ...owner, mode, pool });
      await createStoredRun(state);
      return c.json(snapshotRun(state), 201);
    } catch (error) { return errorResponse(error, c); }
  });
  routes.post("/runs/:runId", async (c) => {
    const action = parseAction(await c.req.json().catch(() => null));
    if (!action) return c.json({ error: "Invalid Read the Runes action." }, 400);
    try {
      const actor = await resolveActorFromRequest(c.req.raw.headers);
      const { ownerKey } = ownerFor(actor);
      return c.json(await mutateOwnedRun(c.req.param("runId"), ownerKey, action));
    } catch (error) { return errorResponse(error, c); }
  });
  return routes;
}

export const runesRoutes = createRunesRoutes();
