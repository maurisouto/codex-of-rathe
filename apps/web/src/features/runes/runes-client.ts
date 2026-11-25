import { buildGameApiRequestHeaders } from "@/lib/auth/game-api-headers";

export type RunesArtwork = { id: string; label: string; cropUrl: string };
export type RunesClue = { number: number; label: string; value: string };
export type RunesTerminalArtwork = RunesArtwork & { name: string; fullImageUrl: string; set: string };
export type RunesSnapshot = {
  runId: string;
  mode: "ranked" | "tutorial";
  status: "loading" | "active" | "complete";
  artworks: RunesArtwork[];
  clues: RunesClue[];
  cluesUsed: number;
  cluesRemaining: number;
  elapsedMs: number;
  result?: {
    outcome: "correct" | "incorrect";
    selectedArtwork: RunesTerminalArtwork;
    correctArtwork: RunesTerminalArtwork;
    elapsedMs: number;
    cluesUsed: number;
    recorded?: boolean;
    personalBest?: { rank: number; clues: number; elapsedMs: number } | null;
  };
};
export type RunesBoard = {
  entries: Array<{ rank: number; userId: string; displayName: string; clues: number; elapsedMs: number }>;
  personalBest: { rank: number; userId: string; displayName: string; clues: number; elapsedMs: number } | null;
};

export class RunesRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function isNoActiveRun(error: unknown): boolean {
  return error instanceof RunesRequestError &&
    error.status === 404 && error.message === "No active Read the Runes round.";
}

export async function requestRunes(path: string, body?: Record<string, unknown>, method?: string): Promise<RunesSnapshot> {
  const controller = new AbortController();
  const timeoutError = new Error("The connection to Read the Runes timed out. Try again.");
  const timer = setTimeout(() => controller.abort(timeoutError), 12_000);
  const deadline = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(timeoutError), { once: true });
  });
  try {
    const headers = await Promise.race([
      buildGameApiRequestHeaders({ "Content-Type": "application/json" }, { retryGuestSession: true }),
      deadline,
    ]);
    const response = await fetch(path, {
      method: method ?? (body ? "POST" : "GET"),
      headers,
      cache: "no-store",
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new RunesRequestError(typeof payload?.error === "string" ? payload.error : "The Read the Runes service is unavailable. Try again.", response.status);
    }
    return await response.json() as RunesSnapshot;
  } catch (cause) {
    if (controller.signal.aborted) throw timeoutError;
    if (cause instanceof TypeError) throw new Error("Could not connect to Read the Runes. Check your connection and try again.");
    if (cause instanceof SyntaxError) throw new Error("The Read the Runes service returned an unexpected response. Try again.");
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRunesBoard(signal: AbortSignal): Promise<RunesBoard> {
  const headers = await buildGameApiRequestHeaders();
  const response = await fetch("/api/runes/leaderboard", { headers, cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) });
  if (!response.ok) throw new RunesRequestError("The Read the Runes leaderboard could not be loaded.", response.status);
  return response.json() as Promise<RunesBoard>;
}

export async function fetchRunesStats(signal: AbortSignal) {
  const headers = await buildGameApiRequestHeaders();
  const response = await fetch("/api/runes/stats", { headers, cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) });
  if (!response.ok) throw new RunesRequestError("Your Read the Runes archive could not be loaded.", response.status);
  return response.json() as Promise<{ games: number; wins: number; losses: number; winRate: number; winClueDistribution: Array<{ clues: number; count: number }>; best: { rank: number; clues: number; elapsedMs: number } | null }>;
}
