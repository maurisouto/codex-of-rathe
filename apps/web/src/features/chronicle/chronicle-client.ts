export const MODES = {
  streak: { title: "Streak", description: "Start with three cards. Each correct order adds a card. Your first miss ends the run." },
  timed: { title: "Timed", description: "Order three cards in 30 seconds. You have one attempt." },
  untimed: { title: "Untimed", description: "Order three cards at your own pace. See your time when you get it right." },
} as const;

export type Mode = keyof typeof MODES;

export type PlayCard = { id: string; name: string; cropDataUrl: string };
export type RevealCard = {
  id: string;
  name: string;
  date: string;
  release: string;
  fullImageUrl: string;
  submittedPosition: number;
};

export type RoundResult = {
  outcome: "correct" | "incorrect" | "timeout";
  complete: boolean;
  highestLevel: number;
  elapsedMs: number | null;
  cards: RevealCard[];
};

export type Snapshot = {
  runId: string;
  mode: Mode;
  level: number;
  roundId: string;
  cards: PlayCard[];
  order: string[];
  ready: boolean;
  deadlineMs: number | null;
  serverNowMs: number;
  result: RoundResult | null;
};
export type Action = "ready" | "move" | "submit" | "expire" | "next" | "abandon";
export type SavedResult = {
  runId: string;
  mode: Mode;
  outcome: RoundResult["outcome"];
  highestLevel: number;
  elapsedMs: number | null;
};

const localKey = "chronicle:last-result";
const storageEvent = "chronicle-result";

export class ChronicleRequestError extends Error {
  constructor(readonly status: number) {
    super("Chronicle request failed");
  }
}

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`/api/chronicle/runs${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new ChronicleRequestError(response.status);
  return response.json() as Promise<T>;
}

export function startRun(mode: Mode) {
  return post<Snapshot>("", { mode });
}

export function roundAction(
  snapshot: Snapshot,
  action: Exclude<Action, "abandon">,
  order?: string[],
) {
  return post<Snapshot>(`/${encodeURIComponent(snapshot.runId)}`, {
    action,
    roundId: snapshot.roundId,
    ...(order === undefined ? {} : { order }),
  });
}

export function abandonRun(snapshot: Snapshot) {
  void post<{ ok: true }>(`/${encodeURIComponent(snapshot.runId)}`, {
    action: "abandon",
    roundId: snapshot.roundId,
  }).catch(() => {});
}

export function saveCompletedResult({ mode, runId, result }: Snapshot, storage: Storage) {
  if (!result?.complete) return;
  try {
    if (parseSavedResult(storage.getItem(localKey))?.runId === runId) return;
    const record: SavedResult = {
      runId,
      mode,
      outcome: result.outcome,
      highestLevel: result.highestLevel,
      elapsedMs: mode === "untimed" && result.outcome === "correct" ? result.elapsedMs : null,
    };
    storage.setItem(localKey, JSON.stringify(record));
  } catch {
    // The round still resolves in browsers that disable local storage.
  }
}

export function recordResult(snapshot: Snapshot) {
  try {
    saveCompletedResult(snapshot, window.localStorage);
    window.dispatchEvent(new Event(storageEvent));
  } catch {}
}

export function subscribeToResult(change: () => void) {
  window.addEventListener("storage", change);
  window.addEventListener(storageEvent, change);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener(storageEvent, change);
  };
}

export function localResult() {
  try {
    return window.localStorage.getItem(localKey);
  } catch {
    return null;
  }
}

function isMode(value: unknown): value is Mode {
  return value === "streak" || value === "timed" || value === "untimed";
}

export function parseSavedResult(raw: string | null): SavedResult | null {
  if (!raw) return null;
  try {
    const value: Partial<SavedResult> | null = JSON.parse(raw);
    if (
      !value ||
      !isMode(value.mode) ||
      typeof value.runId !== "string" ||
      (value.outcome !== "correct" && value.outcome !== "incorrect" && value.outcome !== "timeout") ||
      typeof value.highestLevel !== "number" ||
      !Number.isInteger(value.highestLevel) ||
      value.highestLevel < 0 ||
      value.highestLevel > 6 ||
      (value.elapsedMs !== null && (typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0))
    ) {
      return null;
    }
    return value as SavedResult;
  } catch {
    return null;
  }
}

export function moveInOrder(order: readonly string[], id: string, direction: -1 | 1) {
  const source = order.indexOf(id);
  const target = source + direction;
  if (source < 0 || target < 0 || target >= order.length) return null;
  const next = [...order];
  [next[source], next[target]] = [next[target], next[source]];
  return next;
}

export function deadlineFromServer(
  { deadlineMs, serverNowMs }: Pick<Snapshot, "deadlineMs" | "serverNowMs">,
  receivedAt: number,
) {
  return deadlineMs === null ? null : receivedAt + Math.max(0, deadlineMs - serverNowMs);
}

export function elapsedLabel(elapsedMs: number) {
  return `${(elapsedMs / 1_000).toFixed(1)} seconds`;
}

export function highestLevelLabel(highestLevel: number) {
  return highestLevel ? `Highest level cleared: ${highestLevel}` : "No level cleared";
}
