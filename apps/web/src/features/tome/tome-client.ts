import { getSupabaseAccessTokenForApi } from "@/lib/auth/game-api-headers";

export type TomeChoice = { id: string; label: string };

export type TomeQuestion = {
  id: string;
  category: "artist" | "card" | "class" | "type" | "set" | "year" | "rarity";
  prompt: string;
  artUrl: string;
  choices: TomeChoice[];
};

export type TomeAnswer = {
  position: number;
  prompt: string;
  selected: string;
  correct: string;
  cardName: string;
  explanation: string;
  artUrl?: string;
};

export type TomeSnapshot = {
  runId: string;
  position: number;
  total: number;
  score: number;
  status: "question" | "answered" | "complete";
  question: TomeQuestion | null;
  answers: TomeAnswer[];
};

const runsPath = "/api/tome/runs";

type TomeAction =
  | { action: "confirm"; questionId: string; choiceId: string }
  | { action: "replace"; questionId: string };

export class TomeRequestError extends Error {
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

async function tomeHeaders(signedIn: boolean) {
  const headers = new Headers();
  if (signedIn) {
    const { accessToken } = await getSupabaseAccessTokenForApi();
    if (!accessToken) throw new TomeRequestError("Sign in to your account to continue.");
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

async function request(path: string, body: TomeAction | Record<string, never>, signedIn: boolean): Promise<TomeSnapshot> {
  const headers = await tomeHeaders(signedIn);
  headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method: "POST",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 404 && path !== runsPath) {
      throw new TomeRequestError("This trivia session has expired.", true);
    }
    const payload = await response.json().catch(() => null);
    throw new TomeRequestError(
      typeof payload?.error === "string" ? payload.error : "Tome of Fyendal is unavailable right now. Try again.",
    );
  }
  return response.json() as Promise<TomeSnapshot>;
}

export function startTomeRun(signedIn: boolean) {
  return request(runsPath, {}, signedIn);
}

export function updateTomeRun(runId: string, action: TomeAction, signedIn: boolean) {
  return request(`${runsPath}/${encodeURIComponent(runId)}`, action, signedIn);
}

type RankedScore = { rank: number; userId: string; displayName: string; score: number };

export type TomeStandings = { entries: RankedScore[]; personalBest: RankedScore | null };

export async function fetchTomeLeaderboard(signedIn: boolean, signal: AbortSignal) {
  const response = await fetch("/api/tome/leaderboard", {
    headers: await tomeHeaders(signedIn),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: "no-store",
  });
  if (!response.ok) throw new TomeRequestError("The standings could not be loaded.");
  return response.json() as Promise<TomeStandings>;
}
