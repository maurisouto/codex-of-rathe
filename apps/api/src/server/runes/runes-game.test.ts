import { describe, expect, it } from "vitest";
import { applyRunesAction, createRunesRun, RunesError, snapshotRun, type RunesArtwork } from "./runes-game";
import { createCachedRunesPool, createRunesTutorialPool, loadRunesTutorialPoolCached } from "./runes-pool";

const artworks: RunesArtwork[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Target secret", cropUrl: "data:image/webp;base64,AAAA", fullImageUrl: "https://example.test/target.png", set: "Set", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Max Kostin" }] },
  { id: "00000000-0000-4000-8000-000000000002", name: "Distractor one", cropUrl: "data:image/webp;base64,BBBB", fullImageUrl: "https://example.test/one.png", set: "Set", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Other One" }] },
  { id: "00000000-0000-4000-8000-000000000003", name: "Distractor two", cropUrl: "data:image/webp;base64,CCCC", fullImageUrl: "https://example.test/two.png", set: "Set", facts: [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Other Two" }] },
  { id: "00000000-0000-4000-8000-000000000004", name: "Distractor three", cropUrl: "data:image/webp;base64,DDDD", fullImageUrl: "https://example.test/three.png", set: "Set", facts: [{ category: "class", label: "Class", value: "Wizard" }, { category: "artist", label: "Illustrated by", value: "Other Three" }] },
];
const pickLast = (end: number) => end - 1;

describe("Read the Runes game", () => {
  it("starts the timer only on ready, reveals broad clues before specific ones, and keeps active identity private", () => {
    const run = createRunesRun({ ownerKey: "guest:test", userId: null, mode: "ranked", pool: artworks, now: 100, pick: pickLast });
    expect(run.status).toBe("loading");
    expect(snapshotRun(run, 500).elapsedMs).toBe(0);
    const first = applyRunesAction(run, { action: "ready", requestId: "ready-1" }, 1_000) as ReturnType<typeof snapshotRun>;
    expect(first.status).toBe("active");
    expect(first.clues).toEqual([{ number: 1, label: "Class", value: "Runeblade" }]);
    expect(first.artworks).toHaveLength(4);
    expect(JSON.stringify(first)).not.toContain("Target secret");
    expect(JSON.stringify(first)).not.toContain("target.png");
    expect(JSON.stringify(first)).not.toContain("Max Kostin");
    expect(JSON.stringify(first)).not.toContain("correctId");
    expect(first.elapsedMs).toBe(0);
    expect(snapshotRun(run, 1_600).elapsedMs).toBe(600);
  });

  it("reveals one clue per request, permits a final clue answer, and makes confirmation terminal and idempotent", () => {
    const run = createRunesRun({ ownerKey: "guest:test", userId: null, mode: "ranked", pool: artworks, now: 0, pick: pickLast });
    applyRunesAction(run, { action: "ready", requestId: "ready" }, 500);
    const revealed = applyRunesAction(run, { action: "reveal", requestId: "reveal-1", expectedCluesRevealed: 1 }, 900) as ReturnType<typeof snapshotRun>;
    expect(revealed.clues).toEqual([
      { number: 1, label: "Class", value: "Runeblade" },
      { number: 2, label: "Illustrated by", value: "Max Kostin" },
    ]);
    const targetId = run.targetId;
    const answer = applyRunesAction(run, { action: "confirm", requestId: "confirm-1", artworkId: targetId }, 1_200) as ReturnType<typeof snapshotRun>;
    expect(answer.status).toBe("complete");
    expect(answer.result?.outcome).toBe("correct");
    expect(answer.result?.elapsedMs).toBe(700);
    expect(answer.result?.correctArtwork.name).toBe("Target secret");
    expect(answer.result?.correctArtwork.fullImageUrl).toBe("https://example.test/target.png");
    expect(applyRunesAction(run, { action: "confirm", requestId: "confirm-1", artworkId: artworks[1]!.id }, 1_500)).toEqual(answer);
    expect(() => applyRunesAction(run, { action: "reveal", requestId: "after-end", expectedCluesRevealed: 2 }, 1_600)).toThrow(RunesError);
    expect(() => applyRunesAction(run, { action: "confirm", requestId: "confirm-2", artworkId: targetId }, 1_600)).toThrow(RunesError);
    expect(() => applyRunesAction(run, { action: "ready", requestId: "ready-again" }, 1_600)).toThrow(RunesError);
  });

  it("ends immediately for a wrong answer, including in tutorial mode", () => {
    const fixture = artworks.map((artwork, index) => ({ ...artwork, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }));
    fixture[0]!.name = "Rune Flash";
    fixture[0]!.facts = [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Dmitry Solodovnikov" }];
    fixture[1]!.name = "Read the Runes";
    fixture[1]!.facts = [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Max Kostin" }];
    fixture[2]!.name = "Mauvrion Skies";
    fixture[2]!.facts = [{ category: "class", label: "Class", value: "Runeblade" }, { category: "artist", label: "Illustrated by", value: "Daria Khlebnikova" }];
    fixture[3]!.name = "Zap";
    fixture[3]!.facts = [{ category: "class", label: "Class", value: "Wizard" }, { category: "artist", label: "Illustrated by", value: "Anastasiya Grintsova" }];
    const run = createRunesRun({ ownerKey: "guest:test", userId: null, mode: "tutorial", pool: fixture, now: 0 });
    applyRunesAction(run, { action: "ready", requestId: "ready" }, 10);
    const result = applyRunesAction(run, { action: "confirm", requestId: "wrong", artworkId: fixture[0]!.id }, 100) as ReturnType<typeof snapshotRun>;
    expect(result.status).toBe("complete");
    expect(result.result?.outcome).toBe("incorrect");
    expect(result.clues).toHaveLength(2);
    expect(result.result?.cluesUsed).toBe(1);
    expect(result.cluesRemaining).toBe(0);
    expect(result.result?.correctArtwork.name).toBe("Read the Runes");
  });

  it("validates the fixed tutorial against the locked catalog printings and reveals only the verified clue facts", () => {
    const pool = createRunesTutorialPool(artworks.map(({ cropUrl }) => cropUrl));
    expect(pool.map(({ name, set }) => [name, set])).toEqual([
      ["Rune Flash", "Arcane Rising"], ["Read the Runes", "Arcane Rising"],
      ["Mauvrion Skies", "Crucible of War"], ["Zap", "Arcane Rising"],
    ]);
    expect(pool.map(({ sourceCardIdentifier, sourcePrint }) => [sourceCardIdentifier, sourcePrint])).toEqual([
      ["rune-flash-red", "ARC100-First"], ["read-the-runes-red", "ARC109-First"],
      ["mauvrion-skies-red", "CRU145-First"], ["zap-red", "ARC144-First"],
    ]);
    expect(pool[1]?.facts).toEqual([
      { category: "class", label: "Class", value: "Runeblade" },
      { category: "artist", label: "Illustrated by", value: "Max Kostin" },
    ]);
    expect(createRunesTutorialPool(["data:image/webp;base64,AAAA", null, "data:image/webp;base64,CCCC", "data:image/webp;base64,DDDD"])).toEqual([]);
  });

  it("caches immutable artwork pools after the first load", () => {
    let calls = 0;
    const getPool = createCachedRunesPool(() => { calls += 1; return [...artworks]; });
    const first = getPool();
    const second = getPool();
    expect(first).toBe(second);
    expect(calls).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("loads only verified 330×276 crops for the exact tutorial source printings", () => {
    const pool = loadRunesTutorialPoolCached();
    expect(pool).toHaveLength(4);
    expect(pool.map(({ sourceCardIdentifier, sourcePrint }) => [sourceCardIdentifier, sourcePrint])).toEqual([
      ["rune-flash-red", "ARC100-First"], ["read-the-runes-red", "ARC109-First"],
      ["mauvrion-skies-red", "CRU145-First"], ["zap-red", "ARC144-First"],
    ]);
    expect(pool.every(({ cropUrl }) => cropUrl.startsWith("data:image/webp;base64,"))).toBe(true);
  });
});
