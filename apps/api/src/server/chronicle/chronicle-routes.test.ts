import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { createChronicleGame, type ChronicleEntry } from "./chronicle-game";
import { createChronicleRoutes } from "./chronicle-routes";

const entries: ChronicleEntry[] = Array.from({ length: 8 }, (_, i) => ({
  id: `internal-${i}`,
  name: `Card ${i}`,
  release: `Release ${i}`,
  date: `2020-01-0${i + 1}`,
  cropDataUrl: "data:image/webp;base64,AAAA",
  fullImageUrl: `https://product-images.tcgplayer.com/${i}.jpg`,
}));

it("serves guest rounds with opaque IDs and withholds the timeline until resolution", async () => {
  let now = 1_000;
  const game = createChronicleGame(() => entries, { now: () => now });
  const app = new Hono().route("/api/chronicle", createChronicleRoutes(game));
  const post = (path: string, data: unknown) => app.request(`/api/chronicle${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const response = await post("/runs", { mode: "timed" });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  type Snapshot = ReturnType<typeof game.start>;
  const state = await response.json() as Snapshot;
  expect(state.result).toBeNull();
  expect(state.cards).toHaveLength(3);
  for (const card of state.cards) {
    expect(Object.keys(card).sort()).toEqual(["cropDataUrl", "id", "name"]);
    expect(card.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(card.cropDataUrl).toMatch(/^data:image\/webp;base64,/);
  }
  expect(JSON.stringify(state)).not.toMatch(/internal-|Release |2020-01-|product-images/);
  const action = (name: string, extra = {}) => post(`/runs/${state.runId}`, {
    action: name, roundId: state.roundId, ...extra,
  });
  expect((await action("submit", { order: state.order })).status).toBe(409);
  expect((await action("ready")).status).toBe(200);
  const order = [...state.order].reverse();
  expect((await (await action("move", { order })).json() as Snapshot).order).toEqual(order);
  now += 30_000;
  const reveal = await (await action("expire")).json() as Snapshot;
  expect(reveal.result).toMatchObject({ outcome: "timeout", highestLevel: 0, complete: true });
  expect(reveal.result!.cards).toEqual(expect.arrayContaining([
    expect.objectContaining({ date: expect.stringMatching(/^2020-01-/), release: expect.stringMatching(/^Release /),
      fullImageUrl: expect.stringMatching(/^https:/) }),
  ]));
  expect(reveal.result!.cards.slice().sort((a: { submittedPosition: number }, b: { submittedPosition: number }) =>
    a.submittedPosition - b.submittedPosition).map(({ id }: { id: string }) => id)).toEqual(order);
  expect((await action("abandon")).status).toBe(200);
  expect((await action("ready")).status).toBe(404);
});

it("returns recoverable setup and action errors", async () => {
  const app = createChronicleRoutes(createChronicleGame(() => []));
  const post = (path: string, body: string) => app.request(path, { method: "POST", body });
  expect((await post("/runs", '{"mode":"other"}')).status).toBe(400);
  expect((await post("/runs", '{"mode":"streak"}')).status).toBe(503);
  expect((await post("/runs/unknown", "{ not json")).status).toBe(400);
});

it.each(["timed", "untimed"] as const)("scores verified %s play from the first board disclosure", async (mode) => {
  let now = 1_000;
  const game = createChronicleGame(() => entries, { now: () => now });
  const recordBest = vi.fn(async () => {});
  const app = createChronicleRoutes(game, {
    resolveUser: async (headers) => headers.get("Authorization")?.slice(7) ?? null,
    recordBest,
    getLeaderboard: async () => ({ entries: [], personalBest: null }),
  });
  const post = (path: string, body: object, user?: string) => app.request(path, {
    method: "POST",
    headers: user ? { Authorization: `Bearer ${user}` } : {},
    body: JSON.stringify(body),
  });

  type Snapshot = ReturnType<typeof game.start>;
  const start = await (await post("/runs", { mode, userId: "second-user" }, "first-user")).json() as Snapshot;
  const path = `/runs/${start.runId}`;
  const ready = { action: "ready", roundId: start.roundId };
  expect(start.cards).toEqual([]);
  expect(start.order).toEqual([]);
  expect((await post(path, ready, "second-user")).status).toBe(404);
  expect((await post(path, ready)).status).toBe(404);

  now += 10_000;
  const active = await (await post(path, ready, "first-user")).json() as Snapshot;
  expect(active.cards).toHaveLength(3);
  now += 1_345;
  const order = [...active.cards].sort((a, b) => a.name.localeCompare(b.name)).map(({ id }) => id);
  const submit = { action: "submit", roundId: start.roundId, order, elapsedMs: 1, score: 1 };
  const response = await post(path, submit, "first-user");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { outcome: "correct", elapsedMs: 1_345 } });
  expect(recordBest).toHaveBeenCalledExactlyOnceWith("first-user", mode, 1_345);
  await post(path, submit, "first-user");
  expect(recordBest).toHaveBeenCalledTimes(1);
});

it("retries a failed Streak score before abandoning the run", async () => {
  const index = Array.from({ length: 33 }, (_, i) => ({
    ...entries[0],
    id: String(i),
    name: `Card ${String(i).padStart(2, "0")}`,
    date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10),
  }));
  const recordBest = vi.fn(async () => {}).mockRejectedValueOnce(new Error("Database unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const getLeaderboard = vi.fn(async () => ({ entries: [], personalBest: null }));
  const game = createChronicleGame(() => index);
  const app = createChronicleRoutes(game, {
    resolveUser: async (headers) => headers.has("Authorization") ? "player" : null,
    recordBest,
    getLeaderboard,
  });
  const headers = { Authorization: "Bearer token" };

  try {
    const start = await (await app.request("/runs", {
      method: "POST", headers, body: JSON.stringify({ mode: "streak" }),
    })).json() as ReturnType<typeof game.start>;
    const action = (action: string, order?: string[]) => app.request(`/runs/${start.runId}`, {
      method: "POST", headers, body: JSON.stringify({ action, roundId: start.roundId, order }),
    });
    expect((await action("ready")).status).toBe(200);
    const order = [...start.cards].sort((a, b) => a.name.localeCompare(b.name)).map(({ id }) => id);
    expect((await action("submit", order)).status).toBe(503);
    expect((await action("abandon")).status).toBe(200);
    expect(recordBest.mock.calls).toEqual([["player", "streak", 1], ["player", "streak", 1]]);
    expect((await action("ready")).status).toBe(404);
    expect((await app.request("/leaderboard?mode=other")).status).toBe(400);
    expect((await app.request("/leaderboard?mode=timed")).status).toBe(200);
    expect(getLeaderboard).toHaveBeenCalledWith("timed", null);
    expect((await app.request("/leaderboard", { headers })).status).toBe(200);
    expect(getLeaderboard).toHaveBeenCalledWith("streak", "player");
  } finally {
    log.mockRestore();
  }
});
