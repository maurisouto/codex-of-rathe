import { Hono } from "hono";
import { createTomeGame, TomeError, type TomeAction } from "./tome-game";
import { loadTomePool, type TomeArtwork } from "./tome-pool";

function parseAction(body: unknown): TomeAction | null {
  if (!body || typeof body !== "object") return null;
  const { action, questionId, choiceId } = body as Record<string, unknown>;
  if (typeof questionId !== "string" || questionId.length !== 36) return null;
  if (action === "answer" && typeof choiceId === "string" && choiceId.length === 36) {
    return { action, questionId, choiceId };
  }
  if (action === "next" || action === "replace") return { action, questionId };
  return null;
}

type Results = {
  resolveUser: (headers: Headers, provision: boolean) => Promise<string | null>;
  recordResult: typeof import("./tome-results").recordTomeResult;
  getLeaderboard: typeof import("./tome-results").getTomeLeaderboard;
};

export function createTomeRoutes(game: ReturnType<typeof createTomeGame>, results?: Results) {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.get("/leaderboard", async (c) => {
    if (!results) return c.json({ error: "Tome rankings are unavailable." }, 503);
    const userId = await results.resolveUser(c.req.raw.headers, false);
    if (!userId && c.req.header("Authorization")) {
      return c.json({ error: "Invalid or expired access token." }, 401);
    }
    return c.json(await results.getLeaderboard(userId));
  });

  routes.post("/runs", async (c) => {
    try {
      const userId = await results?.resolveUser(c.req.raw.headers, true) ?? null;
      if (!userId && c.req.header("Authorization")) {
        return c.json({ error: "Invalid or expired access token." }, 401);
      }
      return c.json(game.start(userId), 201);
    } catch (error) {
      if (error instanceof TomeError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
  routes.post("/runs/:runId", async (c) => {
    const action = parseAction(await c.req.json().catch(() => null));
    if (!action) return c.json({ error: "Invalid Tome action." }, 400);
    try {
      const userId = await results?.resolveUser(c.req.raw.headers, false) ?? null;
      if (!userId && c.req.header("Authorization")) {
        return c.json({ error: "Invalid or expired access token." }, 401);
      }
      const snapshot = game.act(c.req.param("runId"), action, userId);
      if (results && userId && snapshot.status === "complete") {
        try {
          await results.recordResult(snapshot.runId, userId, snapshot.score);
        } catch (error) {
          console.error("Could not save Tome result", error);
          return c.json({ error: "Your result could not be saved. Select See results to try again." }, 503);
        }
      }
      return c.json(snapshot);
    } catch (error) {
      if (error instanceof TomeError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
  return routes;
}

let pool: TomeArtwork[] | undefined;
export const tomeRoutes = createTomeRoutes(createTomeGame(() => pool ??= loadTomePool()), {
  async resolveUser(headers, provision) {
    if (!headers.has("authorization")) return null;
    const { tryResolveUserIdFromRequest } = await import("@/server/auth/resolve-actor");
    return tryResolveUserIdFromRequest(headers, { provisionLocalUser: provision });
  },
  async recordResult(...args) {
    const { recordTomeResult } = await import("./tome-results");
    return recordTomeResult(...args);
  },
  async getLeaderboard(...args) {
    const { getTomeLeaderboard } = await import("./tome-results");
    return getTomeLeaderboard(...args);
  },
});
