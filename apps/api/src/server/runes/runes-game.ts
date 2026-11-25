import { randomInt, randomUUID } from "node:crypto";

export type RunesClue = { label: string; value: string; category: string };
export type RunesArtwork = {
  id: string;
  name: string;
  cropUrl: string;
  fullImageUrl: string;
  set: string;
  facts: RunesClue[];
  sourceCardIdentifier?: string;
  sourcePrint?: string;
};
export type RunesMode = "ranked" | "tutorial";
export type RunesAction =
  | { action: "ready"; requestId: string }
  | { action: "reveal"; requestId: string; expectedCluesRevealed: number }
  | { action: "ack"; requestId: string }
  | { action: "confirm"; requestId: string; artworkId: string };

export type RunesRunState = {
  runId: string;
  ownerKey: string;
  userId: string | null;
  mode: RunesMode;
  startedAt: number | null;
  expiresAt: number;
  status: "loading" | "active" | "complete" | "closed";
  artworks: RunesArtwork[];
  targetId: string;
  clueOrder: RunesClue[];
  revealed: number;
  terminal: null | {
    outcome: "correct" | "incorrect";
    selectedId: string;
    elapsedMs: number;
  };
  actionSnapshots: Record<string, unknown>;
};
export type RunesSnapshot = {
  runId: string;
  mode: RunesMode;
  status: "loading" | "active" | "complete";
  artworks: { id: string; label: string; cropUrl: string }[];
  clues: { number: number; label: string; value: string }[];
  cluesRemaining: number;
  cluesUsed: number;
  elapsedMs: number;
  result?: {
    outcome: "correct" | "incorrect";
    selectedArtwork: ReturnType<typeof terminalArtwork>;
    correctArtwork: ReturnType<typeof terminalArtwork>;
    elapsedMs: number;
    cluesUsed: number;
    personalBest?: unknown;
    recorded?: boolean;
  };
};

export class RunesError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, message: string) { super(message); }
}

const MAX_REQUESTS = 64;
const ROUND_CLUE_COUNT = 4;
const ACTIVE_TTL_MS = 60 * 60 * 1000;
const COMPLETE_TTL_MS = 24 * 60 * 60 * 1000;

function shuffle<T>(items: readonly T[], pick: (end: number) => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function answerFacts(artwork: RunesArtwork): Map<string, RunesClue> {
  const grouped = new Map<string, RunesClue[]>();
  for (const fact of artwork.facts) grouped.set(fact.category, [...(grouped.get(fact.category) ?? []), fact]);
  return new Map([...grouped].flatMap(([category, facts]) => facts.length === 1 ? [[category, facts[0]!] as const] : []));
}

function categoryCombinations(categories: readonly string[], count: number): string[][] {
  const combinations: string[][] = [];
  function collect(start: number, selected: string[]) {
    if (selected.length === count) { combinations.push(selected); return; }
    for (let index = start; index <= categories.length - (count - selected.length); index++) {
      collect(index + 1, [...selected, categories[index]!]);
    }
  }
  collect(0, []);
  return combinations;
}

function sample<T>(items: readonly T[], count: number, pick: (end: number) => number): T[] {
  const selected: T[] = [];
  for (let attempt = 0; selected.length < count && attempt < count * 4; attempt++) {
    const item = items[pick(items.length)];
    if (item !== undefined && !selected.includes(item)) selected.push(item);
  }
  if (selected.length < count) {
    for (const item of items) {
      if (!selected.includes(item)) selected.push(item);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function chooseRoundClues(options: readonly RunesArtwork[], target: RunesArtwork, pick: (end: number) => number): RunesClue[] | null {
  const factsByArtwork = new Map(options.map((artwork) => [artwork.id, answerFacts(artwork)]));
  const targetFacts = factsByArtwork.get(target.id)!;
  const commonCategories = shuffle([...targetFacts.keys()].filter((category) => category !== "card" &&
    options.every((option) => factsByArtwork.get(option.id)!.has(category))), pick);
  if (commonCategories.length < ROUND_CLUE_COUNT) return null;

  const ranked = categoryCombinations(commonCategories, ROUND_CLUE_COUNT).flatMap((categories) => {
    const broadness = new Map(categories.map((category) => [category, options.filter((option) =>
      factsByArtwork.get(option.id)!.get(category)?.value === targetFacts.get(category)!.value).length]));
    const order = [...categories].sort((a, b) => broadness.get(b)! - broadness.get(a)!);
    const remaining = new Set(options.map(({ id }) => id));
    const clues = order.map((category) => {
      for (const option of options) {
        if (!remaining.has(option.id) || factsByArtwork.get(option.id)!.get(category)?.value !== targetFacts.get(category)!.value) remaining.delete(option.id);
      }
      return targetFacts.get(category)!;
    });
    if (remaining.size !== 1 || !remaining.has(target.id)) return [];
    const candidateCounts = order.map((category) => broadness.get(category)!);
    return [{ clues, score: candidateCounts.reduce((sum, count) => sum + count, 0) }];
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.clues ?? null;
}

function buildRound(pool: readonly RunesArtwork[], pick: (end: number) => number): { artworks: RunesArtwork[]; targetId: string; clueOrder: RunesClue[] } {
  const factsById = new Map(pool.map((artwork) => [artwork.id, answerFacts(artwork)]));
  const groups = new Map<string, { artworks: RunesArtwork[] }>();
  for (const artwork of pool) {
    const categories = [...factsById.get(artwork.id)!.keys()].filter((category) => category !== "card");
    for (const shared of categoryCombinations(categories, ROUND_CLUE_COUNT)) {
      const signature = [...shared].sort().join("\u0000");
      const group = groups.get(signature) ?? { artworks: [] };
      group.artworks.push(artwork);
      groups.set(signature, group);
    }
  }

  for (const group of shuffle([...groups.values()].filter(({ artworks }) => artworks.length >= 4), pick)) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const options = sample(group.artworks, 4, pick);
      for (const target of options) {
        const clueOrder = chooseRoundClues(options, target, pick);
        if (clueOrder) return { artworks: shuffle(options, pick), targetId: target.id, clueOrder };
      }
    }
  }
  throw new RunesError(503, "No verified Read the Runes round is available right now.");
}

function publicArtwork(artwork: RunesArtwork, index: number) {
  return { id: artwork.id, label: `Artwork ${String.fromCharCode(65 + index)}`, cropUrl: artwork.cropUrl };
}

function terminalArtwork(artwork: RunesArtwork, index: number) {
  return { id: artwork.id, label: `Artwork ${String.fromCharCode(65 + index)}`, name: artwork.name, cropUrl: artwork.cropUrl, fullImageUrl: artwork.fullImageUrl, set: artwork.set };
}

export function createRunesRun(input: {
  ownerKey: string;
  userId: string | null;
  mode: RunesMode;
  pool: readonly RunesArtwork[];
  now?: number;
  pick?: (end: number) => number;
}): RunesRunState {
  const now = input.now ?? Date.now();
  const pick = input.pick ?? randomInt;
  if (input.mode === "tutorial") {
    if (input.pool.length !== 4) throw new RunesError(503, "The Read the Runes tutorial artwork is unavailable.");
    const target = input.pool.find(({ name }) => name === "Read the Runes");
    if (!target) throw new RunesError(503, "The Read the Runes tutorial artwork is unavailable.");
    const options = [...input.pool];
    const clues = target.facts.slice(0, ROUND_CLUE_COUNT);
    if (options.length !== 4 || clues.length !== ROUND_CLUE_COUNT || clues[0]?.value !== "Runeblade" || clues[1]?.value !== "Max Kostin") {
      throw new RunesError(503, "The verified Read the Runes tutorial fixture is unavailable.");
    }
    return {
      runId: randomUUID(), ownerKey: input.ownerKey, userId: input.userId, mode: input.mode,
      startedAt: null, expiresAt: now + ACTIVE_TTL_MS, status: "loading", artworks: options,
      targetId: target.id, clueOrder: clues, revealed: 0, terminal: null, actionSnapshots: {},
    };
  }
  const round = buildRound(input.pool, pick);
  return {
    runId: randomUUID(), ownerKey: input.ownerKey, userId: input.userId, mode: input.mode,
    startedAt: null, expiresAt: now + ACTIVE_TTL_MS, status: "loading", ...round,
    revealed: 0, terminal: null, actionSnapshots: {},
  };
}

export function snapshotRun(run: RunesRunState, now = Date.now()): RunesSnapshot {
  const base = {
    runId: run.runId,
    mode: run.mode,
    status: run.status === "closed" ? "complete" as const : run.status,
    artworks: run.artworks.map(publicArtwork),
    clues: (run.terminal ? run.clueOrder : run.clueOrder.slice(0, run.revealed)).map(({ label, value }, index) => ({ number: index + 1, label, value })),
    cluesRemaining: run.terminal ? 0 : run.clueOrder.length - run.revealed,
    cluesUsed: run.revealed,
    elapsedMs: run.terminal?.elapsedMs ?? (run.startedAt === null ? 0 : Math.max(0, Math.min(now - run.startedAt, 60 * 60 * 1000))),
  };
  if (!run.terminal) return base;
  const selectedIndex = run.artworks.findIndex(({ id }) => id === run.terminal!.selectedId);
  const correctIndex = run.artworks.findIndex(({ id }) => id === run.targetId);
  const selected = run.artworks[selectedIndex]!;
  const correct = run.artworks[correctIndex]!;
  return {
    ...base,
    result: {
      outcome: run.terminal.outcome,
      selectedArtwork: terminalArtwork(selected, selectedIndex),
      correctArtwork: terminalArtwork(correct, correctIndex),
      elapsedMs: run.terminal.elapsedMs,
      cluesUsed: run.revealed,
    },
  };
}

export function applyRunesAction(run: RunesRunState, action: RunesAction, now = Date.now()) {
  const cached = run.actionSnapshots[action.requestId] as Partial<RunesSnapshot> | undefined;
  if (cached) {
    // Legacy snapshots predate cluesUsed; preserve their historical count on retry.
    if (cached.clues && cached.cluesUsed === undefined) {
      cached.cluesUsed = cached.result?.cluesUsed ?? cached.clues.length;
    }
    return cached;
  }
  if (run.status === "complete" || run.status === "closed") {
    if (action.action === "ack") {
      run.status = "closed";
      const result = { runId: run.runId, acknowledged: true };
      run.actionSnapshots[action.requestId] = result;
      return result;
    }
    throw new RunesError(409, "This Read the Runes round is already complete.");
  }
  if (run.expiresAt <= now) throw new RunesError(409, "This Read the Runes round has expired.");
  if (action.action === "ready") {
    if (run.status === "active") throw new RunesError(409, "The round is already ready.");
    run.status = "active";
    run.startedAt = now;
    run.revealed = 1;
  } else {
    if (run.status !== "active" || run.startedAt === null) throw new RunesError(409, "The round is not ready yet.");
    if (action.action === "ack") throw new RunesError(409, "There is no completed result to close.");
    if (action.action === "reveal") {
      if (action.expectedCluesRevealed !== run.revealed) throw new RunesError(409, "The round changed in another request. Review the latest clue state.");
      if (run.revealed >= run.clueOrder.length) throw new RunesError(409, "All clues have already been revealed.");
      run.revealed += 1;
    } else {
      if (!run.artworks.some(({ id }) => id === action.artworkId)) throw new RunesError(400, "Choose an artwork from this round.");
      const elapsedMs = Math.max(0, Math.min(now - run.startedAt, 60 * 60 * 1000));
      run.terminal = { outcome: action.artworkId === run.targetId ? "correct" : "incorrect", selectedId: action.artworkId, elapsedMs };
      run.status = "complete";
      run.expiresAt = now + COMPLETE_TTL_MS;
    }
  }
  const result = snapshotRun(run, now);
  run.actionSnapshots[action.requestId] = result;
  const ids = Object.keys(run.actionSnapshots);
  if (ids.length > MAX_REQUESTS) delete run.actionSnapshots[ids[0]!];
  return result;
}
