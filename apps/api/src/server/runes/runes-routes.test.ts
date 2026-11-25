import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { RunesRunState } from "./runes-game";

const testState = vi.hoisted(() => ({
  actor: { kind: "guest", guestId: "guest-test" } as { kind: "guest"; guestId: string } | { kind: "user"; userId: string },
  runs: new Map<string, { state: RunesRunState; revision: number; order: number }>(),
  sequence: 0,
  record: vi.fn(),
}));

vi.mock("@/server/auth/resolve-actor", () => ({
  resolveActorFromRequest: vi.fn(async () => testState.actor),
}));
vi.mock("./runes-pool", () => ({
  loadRunesArtworkPool: () => fixtures,
  loadRunesTutorialPoolCached: () => fixtures.map((art, index) => ({ ...art, name: ["Rune Flash", "Read the Runes", "Mauvrion Skies", "Zap"][index]! })),
}));
vi.mock("./runes-store", () => ({
  createStoredRun: vi.fn(async (state: RunesRunState) => { testState.runs.set(state.runId, { state, revision: 0, order: ++testState.sequence }); }),
  getCurrentRun: vi.fn(async (ownerKey: string) => {
    const rows = [...testState.runs.values()].filter(({ state }) => state.ownerKey === ownerKey && state.expiresAt > Date.now());
    const active = rows.filter(({ state }) => state.status === "loading" || state.status === "active").sort((a, b) => b.order - a.order)[0];
    const row = active ?? rows.filter(({ state }) => state.status === "complete").sort((a, b) => b.order - a.order)[0];
    return row ? { state: row.state, revision: row.revision } : null;
  }),
  getOwnedRun: vi.fn(async (runId: string, ownerKey: string) => {
    const row = testState.runs.get(runId);
    return row?.state.ownerKey === ownerKey ? { state: row.state, revision: row.revision } : null;
  }),
  saveRunRevision: vi.fn(async (state: RunesRunState, revision: number) => {
    const row = testState.runs.get(state.runId);
    if (!row || row.revision !== revision) return false;
    testState.runs.set(state.runId, { ...row, state, revision: revision + 1 });
    return true;
  }),
}));
vi.mock("./runes-results", () => ({
  recordRuneResult: (...args: unknown[]) => testState.record(...args),
  getRuneLeaderboard: vi.fn(async () => ({ entries: [], personalBest: null })),
  getRuneStats: vi.fn(async () => ({ games: 0, wins: 0, losses: 0, winRate: 0, winClueDistribution: [], best: null })),
}));

const fixtures = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Target", cropUrl: "data:image/webp;base64,AAAA", fullImageUrl: "https://example.test/target", set: "A", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "form", label: "Card type", value: "Action" }, { category: "artist", label: "Illustrated by", value: "Target Artist" }] },
  { id: "00000000-0000-4000-8000-000000000002", name: "Other 1", cropUrl: "data:image/webp;base64,BBBB", fullImageUrl: "https://example.test/one", set: "A", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "form", label: "Card type", value: "Action" }, { category: "artist", label: "Illustrated by", value: "Other Artist 1" }] },
  { id: "00000000-0000-4000-8000-000000000003", name: "Other 2", cropUrl: "data:image/webp;base64,CCCC", fullImageUrl: "https://example.test/two", set: "A", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "form", label: "Card type", value: "Equipment" }, { category: "artist", label: "Illustrated by", value: "Other Artist 2" }] },
  { id: "00000000-0000-4000-8000-000000000004", name: "Other 3", cropUrl: "data:image/webp;base64,DDDD", fullImageUrl: "https://example.test/three", set: "A", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "form", label: "Card type", value: "Equipment" }, { category: "artist", label: "Illustrated by", value: "Other Artist 3" }] },
];

const appPromise = import("./runes-routes").then(({ createRunesRoutes }) => new Hono().route("/api/runes", createRunesRoutes()));
const headers = { "x-guest-id": "guest-test" };
const requestId = () => crypto.randomUUID();
type Started = { runId: string; artworks: { id: string }[] };
type Terminal = { runId: string; status: string; result: { outcome: string; recorded: boolean } };
const readJson = <T>(response: Response) => response.json() as Promise<T>;

describe("Read the Runes API recovery and idempotency", () => {
  beforeEach(() => {
    testState.actor = { kind: "guest", guestId: "guest-test" };
    testState.runs.clear();
    testState.sequence = 0;
    testState.record.mockReset();
  });

  it("returns 404 without a run, restores an active run, recovers a committed loss, and closes it on acknowledgement", async () => {
    const app = await appPromise;
    expect((await app.request("/api/runes/runs", { headers })).status).toBe(404);
    const started = await app.request("/api/runes/runs", { method: "POST", headers, body: JSON.stringify({ mode: "ranked" }) });
    const initial = await readJson<Started>(started);
    const ready = await app.request(`/api/runes/runs/${initial.runId}`, { method: "POST", headers, body: JSON.stringify({ action: "ready", requestId: requestId() }) });
    expect((await readJson<{ status: string }>(ready)).status).toBe("active");
    const resumed = await app.request("/api/runes/runs", { headers });
    expect((await readJson<Started>(resumed)).runId).toBe(initial.runId);
    const wrong = (await initial.artworks.find(({ id }: { id: string }) => id !== testState.runs.get(initial.runId)!.state.targetId))!;
    const confirmKey = requestId();
    const confirmPath = `/api/runes/runs/${initial.runId}`;
    const confirmed = await app.request(confirmPath, { method: "POST", headers, body: JSON.stringify({ action: "confirm", requestId: confirmKey, artworkId: wrong.id }) });
    const result = await readJson<Terminal>(confirmed);
    expect(result.status).toBe("complete");
    expect(result.result.outcome).toBe("incorrect");
    expect(result.result.recorded).toBe(false);
    const refreshed = await app.request("/api/runes/runs", { headers });
    expect(await readJson<Terminal>(refreshed)).toEqual(result);
    const retried = await app.request(confirmPath, { method: "POST", headers, body: JSON.stringify({ action: "confirm", requestId: confirmKey, artworkId: wrong.id }) });
    expect(await readJson<Terminal>(retried)).toEqual(result);
    const freshConfirm = await app.request(confirmPath, { method: "POST", headers, body: JSON.stringify({ action: "confirm", requestId: requestId(), artworkId: wrong.id }) });
    expect(freshConfirm.status).toBe(409);
    const ackKey = requestId();
    const ack = await app.request(confirmPath, { method: "POST", headers, body: JSON.stringify({ action: "ack", requestId: ackKey }) });
    expect(await readJson<{ acknowledged: boolean }>(ack)).toMatchObject({ acknowledged: true });
    const ackRetry = await app.request(confirmPath, { method: "POST", headers, body: JSON.stringify({ action: "ack", requestId: ackKey }) });
    expect(await readJson<{ acknowledged: boolean }>(ackRetry)).toMatchObject({ acknowledged: true });
    expect((await app.request("/api/runes/runs", { headers })).status).toBe(404);
  });

  it("prefers the newest active run over an earlier unacknowledged result", async () => {
    const app = await appPromise;
    const firstResponse = await app.request("/api/runes/runs", { method: "POST", headers, body: JSON.stringify({ mode: "ranked" }) });
    const first = await readJson<Started>(firstResponse);
    const wrong = first.artworks.find(({ id }: { id: string }) => id !== testState.runs.get(first.runId)!.state.targetId);
    await app.request(`/api/runes/runs/${first.runId}`, { method: "POST", headers, body: JSON.stringify({ action: "ready", requestId: requestId() }) });
    await app.request(`/api/runes/runs/${first.runId}`, { method: "POST", headers, body: JSON.stringify({ action: "confirm", requestId: requestId(), artworkId: wrong!.id }) });
    const secondResponse = await app.request("/api/runes/runs", { method: "POST", headers, body: JSON.stringify({ mode: "ranked" }) });
    const second = await readJson<Started>(secondResponse);
    expect((await readJson<Started>(await app.request("/api/runes/runs", { headers }))).runId).toBe(second.runId);
  });

  it("allows an exact reveal retry but rejects stale concurrent reveal requests", async () => {
    const app = await appPromise;
    const initial = await readJson<Started>(await app.request("/api/runes/runs", { method: "POST", headers, body: JSON.stringify({ mode: "ranked" }) }));
    const path = `/api/runes/runs/${initial.runId}`;
    await app.request(path, { method: "POST", headers, body: JSON.stringify({ action: "ready", requestId: requestId() }) });
    const revealKey = requestId();
    const body = { action: "reveal", requestId: revealKey, expectedCluesRevealed: 1 };
    const first = await app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
    expect((await readJson<{ clues: unknown[] }>(first)).clues).toHaveLength(2);
    const staleSecond = await app.request(path, { method: "POST", headers, body: JSON.stringify({ ...body, requestId: requestId() }) });
    expect(staleSecond.status).toBe(409);
    const retry = await app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
    expect((await readJson<{ clues: unknown[] }>(retry)).clues).toHaveLength(2);
  });

  it("records authenticated losses in stats storage while excluding them from standings", async () => {
    const app = await appPromise;
    testState.actor = { kind: "user", userId: "00000000-0000-4000-8000-000000000099" };
    const started = await app.request("/api/runes/runs", { method: "POST", headers: { authorization: "Bearer test" }, body: JSON.stringify({ mode: "ranked" }) });
    const initial = await readJson<Started>(started);
    await app.request(`/api/runes/runs/${initial.runId}`, { method: "POST", headers: { authorization: "Bearer test" }, body: JSON.stringify({ action: "ready", requestId: requestId() }) });
    const wrong = initial.artworks.find(({ id }: { id: string }) => id !== testState.runs.get(initial.runId)!.state.targetId);
    const response = await app.request(`/api/runes/runs/${initial.runId}`, { method: "POST", headers: { authorization: "Bearer test" }, body: JSON.stringify({ action: "confirm", requestId: requestId(), artworkId: wrong!.id }) });
    const result = await readJson<Terminal>(response);
    expect(result.result.recorded).toBe(true);
    expect(testState.record).toHaveBeenCalledWith(initial.runId, "00000000-0000-4000-8000-000000000099", "incorrect", 1, expect.any(Number));
  });
});
