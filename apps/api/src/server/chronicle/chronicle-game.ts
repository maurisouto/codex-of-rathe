import { randomInt, randomUUID } from "node:crypto";

const STREAK_LEVELS = [3, 4, 5, 6, 7, 8] as const;
export const STREAK_FAMILY_COUNT = STREAK_LEVELS.reduce((total, size) => total + size, 0);
const TIMED_LIMIT_MS = 30_000;
const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_RUNS = 1_000;
const GUIDE_NAMES = new Set(["snatch", "art of war", "channel mount heroic"]);

export const CHRONICLE_MODES = ["streak", "timed", "untimed"] as const;
export type ChronicleMode = (typeof CHRONICLE_MODES)[number];

export type ChronicleEntry = {
  id: string;
  name: string;
  release: string;
  date: string;
  cropDataUrl: string;
  fullImageUrl: string;
};

export type ChronicleAction = {
  action: "ready" | "move" | "submit" | "expire" | "next" | "abandon";
  roundId: string;
  order?: string[];
};

type RunCard = { id: string; entry: ChronicleEntry };

type Result = {
  outcome: "correct" | "incorrect" | "timeout";
  complete: boolean;
  highestLevel: number;
  elapsedMs: number | null;
  cards: {
    id: string;
    name: string;
    date: string;
    release: string;
    fullImageUrl: string;
    submittedPosition: number;
  }[];
};

type Round = {
  id: string;
  cards: RunCard[];
  order: string[];
  startedAt: number | null;
  result: Result | null;
};

type Run = {
  id: string;
  mode: ChronicleMode;
  rounds: Round[];
  level: number;
  highestLevel: number;
  expiresAt: number;
};

export class ChronicleError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
  }
}

function shuffle<T>(items: readonly T[], pick: (end: number) => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function playableChronicleFamily(name: string): string | null {
  const family = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return family && !GUIDE_NAMES.has(family) ? family : null;
}

function isChronological(cards: readonly RunCard[]): boolean {
  return cards.every((card, index) => index === 0 || cards[index - 1].entry.date <= card.entry.date);
}

function generateRounds(
  entries: readonly ChronicleEntry[],
  mode: ChronicleMode,
  pick: (end: number) => number,
): Round[] {
  const sizes = mode === "streak" ? STREAK_LEVELS : [3];
  const needed = mode === "streak" ? STREAK_FAMILY_COUNT : 3;
  const families = new Set<string>();
  const selection: RunCard[] = [];
  for (const entry of shuffle(entries, pick)) {
    const family = playableChronicleFamily(entry.name);
    if (!family || families.has(family)) continue;
    families.add(family);
    selection.push({ id: randomUUID(), entry });
    if (selection.length === needed) break;
  }
  if (selection.length < needed) {
    throw new ChronicleError(503, "Chronicle does not have enough verified illustrations right now.");
  }

  let offset = 0;
  return sizes.map((size) => {
    const cards = selection.slice(offset, offset + size);
    offset += size;
    if (isChronological(cards)) {
      const later = cards.findIndex((card) => card.entry.date > cards[0].entry.date);
      if (later !== -1) [cards[0], cards[later]] = [cards[later], cards[0]];
    }
    return {
      id: randomUUID(),
      cards,
      order: cards.map(({ id }) => id),
      startedAt: null,
      result: null,
    };
  });
}

function deadlineFor(mode: ChronicleMode, round: Round): number | null {
  return mode === "timed" && round.startedAt !== null ? round.startedAt + TIMED_LIMIT_MS : null;
}

function resolveRound(run: Run, round: Round, now: number, expired: boolean): void {
  const byId = new Map(round.cards.map((card) => [card.id, card]));
  const submitted = round.order.map((id) => byId.get(id)!);
  const correct = !expired && isChronological(submitted);
  if (correct) run.highestLevel = run.level;
  round.result = {
    outcome: expired ? "timeout" : correct ? "correct" : "incorrect",
    complete: !correct || run.level === run.rounds.length,
    highestLevel: run.highestLevel,
    elapsedMs: correct && run.mode === "untimed" ? Math.max(0, now - round.startedAt!) : null,
    // Preserve the submitted relative order when release days tie.
    cards: submitted
      .map(({ id, entry }, index) => ({
        id,
        name: entry.name,
        date: entry.date,
        release: entry.release,
        fullImageUrl: entry.fullImageUrl,
        submittedPosition: index + 1,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function currentRound(run: Run): Round {
  return run.rounds[run.level - 1];
}

function snapshot(run: Run, now: number) {
  const round = currentRound(run);
  return {
    runId: run.id,
    mode: run.mode,
    level: run.level,
    roundId: round.id,
    cards: round.cards.map(({ id, entry }) => ({ id, name: entry.name, cropDataUrl: entry.cropDataUrl })),
    order: [...round.order],
    ready: round.startedAt !== null,
    deadlineMs: deadlineFor(run.mode, round),
    serverNowMs: now,
    result: round.result,
  };
}

function setOrder(round: Round, order: string[] | undefined): void {
  const current = new Set(round.order);
  if (!order || order.length !== current.size || new Set(order).size !== current.size ||
      order.some((id) => !current.has(id))) {
    throw new ChronicleError(400, "Send each illustration in the current round exactly once.");
  }
  round.order = [...order];
}

export function createChronicleGame(
  getEntries: () => readonly ChronicleEntry[],
  { now = Date.now, pick = randomInt, maxRuns = MAX_RUNS, ttlMs = RUN_TTL_MS } = {},
) {
  const runs = new Map<string, Run>();

  function start(mode: ChronicleMode) {
    const time = now();
    for (const [id, run] of runs) {
      if (run.expiresAt <= time) runs.delete(id);
    }
    if (runs.size >= maxRuns) {
      throw new ChronicleError(503, "Chronicle is busy. Try again in a moment.");
    }
    const run: Run = {
      id: randomUUID(),
      mode,
      rounds: generateRounds(getEntries(), mode, pick),
      level: 1,
      highestLevel: 0,
      expiresAt: time + ttlMs,
    };
    runs.set(run.id, run);
    return snapshot(run, time);
  }

  function act(runId: string, request: ChronicleAction) {
    const time = now();
    const run = runs.get(runId);
    if (!run || run.expiresAt <= time) {
      runs.delete(runId);
      if (request.action === "abandon") return { ok: true } as const;
      throw new ChronicleError(404, "This run is no longer available. Start a new round.");
    }
    const round = currentRound(run);
    if (request.roundId !== round.id) {
      if (request.action === "next" && request.roundId === run.rounds[run.level - 2]?.id) {
        return snapshot(run, time);
      }
      throw new ChronicleError(409, "This round is no longer active.");
    }
    if (request.action === "abandon") {
      runs.delete(runId);
      return { ok: true } as const;
    }
    run.expiresAt = time + ttlMs;
    if (request.action === "next") {
      if (round.result?.outcome !== "correct" || round.result.complete) {
        throw new ChronicleError(409, "There is no next level available.");
      }
      run.level++;
      return snapshot(run, time);
    }
    if (round.result) return snapshot(run, time);
    const deadline = deadlineFor(run.mode, round);
    // The last order accepted strictly before the deadline remains authoritative.
    if (deadline !== null && time >= deadline) {
      resolveRound(run, round, time, true);
    } else if (request.action === "ready") {
      round.startedAt ??= time;
    } else if (request.action !== "expire") {
      if (round.startedAt === null) throw new ChronicleError(409, "The round is still loading.");
      setOrder(round, request.order);
      if (request.action === "submit") resolveRound(run, round, time, false);
    }
    return snapshot(run, time);
  }

  return { start, act };
}
