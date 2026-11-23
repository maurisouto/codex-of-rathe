import { Hono } from "hono";
import {
  CHRONICLE_MODES,
  ChronicleError,
  createChronicleGame,
  type ChronicleAction,
  type ChronicleMode,
} from "./chronicle-game";
import { loadChronicleIndex } from "./chronicle-index";

const ACTIONS = new Set(["ready", "move", "submit", "expire", "next", "abandon"]);

function isAction(body: unknown): body is ChronicleAction {
  if (!body || typeof body !== "object") return false;
  const { action, roundId, order } = body as Record<string, unknown>;
  return typeof action === "string" && ACTIONS.has(action) &&
    typeof roundId === "string" && roundId.length === 36 &&
    (order === undefined ||
      (Array.isArray(order) && order.length <= 8 && order.every((id) => typeof id === "string" && id.length === 36)));
}

function isMode(mode: unknown): mode is ChronicleMode {
  return CHRONICLE_MODES.some((knownMode) => knownMode === mode);
}

type Ranking = {
  resolveUser: (headers: Headers, provision: boolean) => Promise<string | null>;
  recordBest: typeof import("./chronicle-leaderboard").recordChronicleBest;
  getLeaderboard: typeof import("./chronicle-leaderboard").getChronicleLeaderboard;
};

export function createChronicleRoutes(game: ReturnType<typeof createChronicleGame>, ranking?: Ranking) {
  const routes = new Hono();
  routes.use("/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.get("/leaderboard", async (c) => {
    const mode = c.req.query("mode") ?? "streak";
    if (!isMode(mode)) return c.json({ error: "Choose a Chronicle mode." }, 400);
    if (!ranking) return c.json({ error: "Chronicle rankings are unavailable." }, 503);

    const userId = await ranking.resolveUser(c.req.raw.headers, false);
    if (!userId && c.req.header("Authorization")) {
      return c.json({ error: "Invalid or expired access token." }, 401);
    }
    return c.json(await ranking.getLeaderboard(mode, userId));
  });

  routes.post("/runs", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || !("mode" in body) || !isMode(body.mode)) {
      return c.json({ error: "Choose a Chronicle mode." }, 400);
    }
    try {
      const userId = await ranking?.resolveUser(c.req.raw.headers, true) ?? null;
      if (!userId && c.req.header("Authorization")) {
        return c.json({ error: "Invalid or expired access token." }, 401);
      }
      return c.json(game.start(body.mode, userId), 201);
    } catch (error) {
      if (error instanceof ChronicleError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/runs/:runId", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isAction(body)) return c.json({ error: "Invalid Chronicle action." }, 400);

    try {
      const userId = await ranking?.resolveUser(c.req.raw.headers, false) ?? null;
      if (!userId && c.req.header("Authorization")) {
        return c.json({ error: "Invalid or expired access token." }, 401);
      }
      const runId = c.req.param("runId");
      // A retry persists the original score before any action can advance or abandon the round.
      const retrySave = ranking && userId ? game.persistScore(runId, userId, ranking.recordBest) : null;
      if (retrySave) await retrySave;
      const snapshot = game.act(runId, body, userId);
      const save = ranking && userId ? game.persistScore(runId, userId, ranking.recordBest) : null;
      if (save) await save;
      return c.json(snapshot);
    } catch (error) {
      if (error instanceof ChronicleError) return c.json({ error: error.message }, error.status);
      console.error("Could not update Chronicle run", error);
      return c.json({ error: "Chronicle could not update this round. Try again." }, 503);
    }
  });

  return routes;
}

let entries: ReturnType<typeof loadChronicleIndex> | undefined;
export const chronicleRoutes = createChronicleRoutes(createChronicleGame(() => entries ??= loadChronicleIndex()), {
  async resolveUser(headers, provision) {
    const authorization = headers.get("authorization");
    if (!authorization) return null;
    const { tryResolveUserIdFromRequest } = await import("@/server/auth/resolve-actor");
    return tryResolveUserIdFromRequest(headers, { provisionLocalUser: provision });
  },
  async recordBest(...args) {
    const { recordChronicleBest } = await import("./chronicle-leaderboard");
    return recordChronicleBest(...args);
  },
  async getLeaderboard(...args) {
    const { getChronicleLeaderboard } = await import("./chronicle-leaderboard");
    return getChronicleLeaderboard(...args);
  },
});
