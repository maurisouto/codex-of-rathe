import { describe, expect, it } from "vitest";
import { createChronicleGame, type ChronicleAction, type ChronicleEntry } from "./chronicle-game";

const entries: ChronicleEntry[] = Array.from({ length: 10 }, (_, i) => ({
  id: `index-${i}`,
  name: `Illustration ${i}`,
  date: `2020-01-${String(i + 1).padStart(2, "0")}`,
  release: `Release ${i}`,
  cropDataUrl: "data:image/webp;base64,AAAA",
  fullImageUrl: `https://product-images.tcgplayer.com/${i}.jpg`,
}));

function fixture(source = entries, maxRuns = 10) {
  let time = 10_000;
  const game = createChronicleGame(() => source, { now: () => time, pick: (end) => end - 1, maxRuns });
  type Snapshot = ReturnType<typeof game.start>;
  const act = (state: Snapshot, action: ChronicleAction["action"], order?: string[]) => {
    const response = game.act(state.runId, { roundId: state.roundId, action, order });
    if (!("roundId" in response)) throw new Error("Expected a snapshot");
    return response;
  };
  const answer = (state: Snapshot) => [...state.cards].sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id }) => id);
  return { game, act, answer, advance: (ms: number) => { time += ms; } };
}

describe("Chronicle progression", () => {
  it("retains cards across six nested levels, adds one at a time, and finishes at eight", () => {
    const { game, act, answer } = fixture();
    let state = game.start("streak");
    let previous: string[] = [];
    for (let level = 1; level <= 6; level++) {
      expect(state.level).toBe(level);
      expect(state.cards).toHaveLength(level + 2);
      expect(state.order).not.toEqual(answer(state));
      expect(state.order).toEqual(expect.arrayContaining(previous));
      expect(state.result).toBeNull();
      expect(state.ready).toBe(false);
      expect(() => act(state, "submit", answer(state))).toThrow("still loading");
      state = act(state, "ready");
      state = act(state, "submit", answer(state));
      expect(state.result).toMatchObject({ outcome: "correct", highestLevel: level, complete: level === 6 });
      const reveal = state.result!.cards;
      expect(reveal.map((card) => card.date)).toEqual([...new Set(reveal.map((card) => card.date))].sort());
      previous = state.order;
      if (level < 6) {
        const current = act(state, "next");
        expect(act(state, "next")).toEqual(current);
        state = current;
      } else {
        expect(() => act(state, "next")).toThrow("no next level");
      }
    }
  });

  it("stops after the first miss and retains only completed levels", () => {
    const { game, act, answer } = fixture();
    let first = act(game.start("streak"), "ready");
    expect(act(first, "submit", first.order).result).toMatchObject({
      outcome: "incorrect", complete: true, highestLevel: 0,
    });
    first = act(game.start("streak"), "ready");
    const cleared = act(first, "submit", answer(first));
    const second = act(act(cleared, "next"), "ready");
    const miss = act(second, "submit", second.order);
    expect(miss.result).toMatchObject({ outcome: "incorrect", complete: true, highestLevel: 1 });
    expect(() => act(miss, "next")).toThrow("no next level");
  });

  it("fails closed before starting a Streak run with insufficient dates, even with extra cards", () => {
    const { game } = fixture(entries.map((row, i) => ({ ...row, date: entries[i % 7].date })));
    expect(() => game.start("streak")).toThrow("enough verified illustrations");
    expect(game.start("untimed").cards).toHaveLength(3);
  });

  it("excludes dated teaching examples, expires idle runs and frees abandoned capacity", () => {
    const { game, advance, act } = fixture([{ ...entries[0], name: "Snatch" }, ...entries.slice(1)], 1);
    const run = game.start("streak");
    expect(run.cards.map(({ name }) => name)).not.toContain("Snatch");
    expect(() => game.start("timed")).toThrow("busy");
    game.act(run.runId, { action: "abandon", roundId: run.roundId });
    expect(() => act(run, "ready")).toThrow("no longer available");
    const expiring = game.start("streak");
    advance(60 * 60 * 1000);
    expect(() => act(expiring, "ready")).toThrow("no longer available");
    expect(game.start("timed").cards).toHaveLength(3);
  });
});

describe("Chronicle timing and results", () => {
  it("starts the clock only when ready and snapshots order strictly before the deadline", () => {
    const { game, act, answer, advance } = fixture();
    let state = game.start("timed");
    expect(state.deadlineMs).toBeNull();
    advance(20_000);
    state = act(state, "ready");
    expect(state.deadlineMs! - state.serverNowMs).toBe(30_000);
    advance(29_999);
    state = act(state, "ready");
    expect(state.deadlineMs! - state.serverNowMs).toBe(1);
    expect(act(state, "expire").result).toBeNull();
    const previousOrder = [...state.order].reverse();
    state = act(state, "move", previousOrder);
    advance(1);
    const late = act(state, "submit", answer(state));
    expect(late.result).toMatchObject({ outcome: "timeout", highestLevel: 0, complete: true, elapsedMs: null });
    expect(late.result!.cards.map(({ id, submittedPosition }) => previousOrder[submittedPosition - 1] === id))
      .toEqual([true, true, true]);
    expect(act(late, "expire").result).toEqual(late.result);
  });

  it("resolves a timely submit once even if an expiry or conflicting submit follows", () => {
    const { game, act, answer, advance } = fixture();
    const state = act(game.start("timed"), "ready");
    advance(29_999);
    const win = act(state, "submit", answer(state));
    expect(win.result).toMatchObject({ outcome: "correct", complete: true, elapsedMs: null });
    advance(10_000);
    expect(act(state, "expire").result).toEqual(win.result);
    expect(act(state, "submit", state.order).result).toEqual(win.result);
  });

  it("scores one Untimed round and reveals elapsed time only on an exact match", () => {
    const { game, act, answer, advance } = fixture();
    const win = act(game.start("untimed"), "ready");
    advance(7_500);
    expect(act(win, "submit", answer(win)).result).toMatchObject({
      outcome: "correct", complete: true, elapsedMs: 7_500,
    });
    const loss = act(game.start("untimed"), "ready");
    advance(5_000);
    expect(act(loss, "submit", loss.order).result).toMatchObject({
      outcome: "incorrect", complete: true, elapsedMs: null,
    });
  });

  it("rejects foreign or duplicate IDs without changing the saved order", () => {
    const { game, act } = fixture();
    const state = act(game.start("timed"), "ready");
    expect(() => act(state, "move", [state.order[0], state.order[0], state.order[1]])).toThrow("exactly once");
    expect(() => act(state, "submit", ["foreign", ...state.order.slice(1)])).toThrow("exactly once");
    expect(act(state, "ready").order).toEqual(state.order);
  });
});
