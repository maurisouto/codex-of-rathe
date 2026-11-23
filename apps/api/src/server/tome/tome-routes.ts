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

export function createTomeRoutes(game: ReturnType<typeof createTomeGame>) {
  const routes = new Hono();
  routes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.post("/runs", (c) => {
    try {
      return c.json(game.start(), 201);
    } catch (error) {
      if (error instanceof TomeError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
  routes.post("/runs/:runId", async (c) => {
    const action = parseAction(await c.req.json().catch(() => null));
    if (!action) return c.json({ error: "Invalid Tome action." }, 400);
    try {
      return c.json(game.act(c.req.param("runId"), action));
    } catch (error) {
      if (error instanceof TomeError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
  return routes;
}

let pool: TomeArtwork[] | undefined;
export const tomeRoutes = createTomeRoutes(createTomeGame(() => pool ??= loadTomePool()));
