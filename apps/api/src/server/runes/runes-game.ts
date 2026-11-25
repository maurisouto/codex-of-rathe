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

function buildRound(pool: readonly RunesArtwork[], pick: (end: number) => number): { artworks: RunesArtwork[]; targetId: string; clueOrder: RunesClue[] } {
  const shuffled = shuffle(pool, pick);
  for (const target of shuffled) {
    const targetFacts = answerFacts(target);
    const others = shuffled.filter((item) => item.id !== target.id);
    const options = [target, ...shuffle(others, pick).slice(0, 3)];
    if (options.length < 4) continue;
    const commonCategories = [...targetFacts.keys()].filter((category) => category !== "card" &&
      options.every((option) => answerFacts(option).has(category)));
    const remaining = new Set(options.map(({ id }) => id));
    const clueOrder: RunesClue[] = [];
    const rankedCategories = shuffle(commonCategories, pick).map((category) => {
      const clue = targetFacts.get(category)!;
      const after = new Set(options.filter((option) => answerFacts(option).get(category)?.value === clue.value).map(({ id }) => id));
      return { category, clue, after };
    }).sort((a, b) => b.after.size - a.after.size);
    for (const { clue, after: matching } of rankedCategories) {
      const after = new Set([...matching].filter((id) => remaining.has(id)));
      if (after.size === remaining.size) continue;
      clueOrder.push(clue);
      remaining.clear();
      for (const id of after) remaining.add(id);
      if (remaining.size === 1) break;
    }
    if (clueOrder.length && remaining.size === 1 && remaining.has(target.id)) {
      return { artworks: shuffle(options, pick), targetId: target.id, clueOrder };
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
    const clues = target.facts;
    if (options.length !== 4 || clues.length !== 2 || clues[0]?.value !== "Runeblade" || clues[1]?.value !== "Max Kostin") {
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
  if (run.actionSnapshots[action.requestId]) return run.actionSnapshots[action.requestId];
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
