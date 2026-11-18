import { Hono } from "hono";
import { expect, it } from "vitest";
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
