import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deadlineFromServer,
  moveInOrder,
  parseSavedResult,
  roundAction,
  saveCompletedResult,
  startRun,
  type RoundResult,
  type Snapshot,
} from "./chronicle-client";

const fixture: Snapshot = {
  runId: "run-id",
  roundId: "round-id",
  mode: "untimed",
  level: 1,
  cards: [],
  order: ["third", "first", "second"],
  ready: true,
  deadlineMs: null,
  serverNowMs: 0,
  result: null,
};

function withResult(mode: Snapshot["mode"], result: Partial<RoundResult>): Snapshot {
  return {
    ...fixture,
    mode,
    result: { outcome: "correct", complete: true, highestLevel: 0, elapsedMs: null, cards: [], ...result },
  };
}

function storageFixture() {
  let raw: string | null = null;
  const storage = {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, next: string) => { raw = next; }),
  };
  return { storage: storage as unknown as Storage, raw: () => raw };
}

afterEach(() => vi.unstubAllGlobals());

describe("Chronicle board", () => {
  it("swaps one adjacent position without mutating the round order", () => {
    const order = ["third", "first", "second"];
    expect(moveInOrder(order, "first", -1)).toEqual(["first", "third", "second"]);
    expect(moveInOrder(order, "first", 1)).toEqual(["third", "second", "first"]);
    expect(moveInOrder(order, "third", -1)).toBeNull();
    expect(moveInOrder(order, "second", 1)).toBeNull();
    expect(moveInOrder(order, "unknown", 1)).toBeNull();
    expect(order).toEqual(fixture.order);
  });

  it("keeps the live deadline on the browser's elapsed clock", () => {
    expect(deadlineFromServer({ deadlineMs: 32_000, serverNowMs: 2_000 }, 71)).toBe(30_071);
    expect(deadlineFromServer({ deadlineMs: 32_000, serverNowMs: 37_000 }, 125)).toBe(125);
    expect(deadlineFromServer({ deadlineMs: null, serverNowMs: 2_000 }, 71)).toBeNull();
  });

  it("sends mode and opaque order only, with no account or answer data", async () => {
    const fetch = vi.fn(async () => Response.json(fixture));
    vi.stubGlobal("fetch", fetch);
    await startRun("untimed");
    await roundAction(fixture, "submit", fixture.order);
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/chronicle/runs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "untimed" }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/chronicle/runs/run-id", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "submit", roundId: "round-id", order: fixture.order }),
    }));
  });
});

describe("Chronicle browser record", () => {
  it("records only a finished Streak once and uses its highest cleared level", () => {
    const { storage, raw } = storageFixture();
    saveCompletedResult(withResult("streak", { highestLevel: 3, complete: false }), storage);
    expect(raw()).toBeNull();

    const finished = withResult("streak", { highestLevel: 3, outcome: "incorrect" });
    saveCompletedResult(finished, storage);
    saveCompletedResult(finished, storage);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(parseSavedResult(raw())).toEqual({
      mode: "streak",
      outcome: "incorrect",
      highestLevel: 3,
      elapsedMs: null,
      runId: "run-id",
    });
  });

  it("stores elapsed time only for an exact Untimed result", () => {
    const { storage, raw } = storageFixture();
    saveCompletedResult(withResult("untimed", { outcome: "correct", elapsedMs: 1_540 }), storage);
    expect(parseSavedResult(raw())?.elapsedMs).toBe(1_540);
    saveCompletedResult({
      ...withResult("untimed", { outcome: "incorrect", elapsedMs: 1_200 }),
      runId: "new-run",
    }, storage);
    expect(parseSavedResult(raw())?.elapsedMs).toBeNull();
  });

  it("allows play when local storage is disabled or the old value is corrupt", () => {
    expect(parseSavedResult("{invalid")).toBeNull();
    expect(parseSavedResult('{"mode":"streak","outcome":"incorrect","highestLevel":45,"elapsedMs":null,"runId":"bad"}')).toBeNull();
    const badStorage = { getItem: () => { throw new Error("disabled"); } } as unknown as Storage;
    expect(() => saveCompletedResult(withResult("timed", { outcome: "timeout" }), badStorage)).not.toThrow();
  });
});
