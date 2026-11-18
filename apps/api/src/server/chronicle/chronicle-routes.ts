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

export function createChronicleRoutes(game: ReturnType<typeof createChronicleGame>) {
  const routes = new Hono();
  routes.use("/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.post("/runs", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || !("mode" in body) || !isMode(body.mode)) {
      return c.json({ error: "Choose a Chronicle mode." }, 400);
    }
    try {
      return c.json(game.start(body.mode), 201);
    } catch (error) {
      if (error instanceof ChronicleError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/runs/:runId", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isAction(body)) return c.json({ error: "Invalid Chronicle action." }, 400);

    try {
      return c.json(game.act(c.req.param("runId"), body));
    } catch (error) {
      if (error instanceof ChronicleError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });

  return routes;
}

let entries: ReturnType<typeof loadChronicleIndex> | undefined;
export const chronicleRoutes = createChronicleRoutes(createChronicleGame(() => entries ??= loadChronicleIndex()));
