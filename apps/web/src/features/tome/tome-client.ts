export type TomeChoice = { id: string; label: string };

export type TomeQuestion = {
  id: string;
  category: "artist" | "class" | "type" | "set" | "year";
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
  | { action: "answer"; questionId: string; choiceId: string }
  | { action: "next" | "replace"; questionId: string };

export class TomeRequestError extends Error {
  constructor(message: string, readonly expired = false) {
    super(message);
  }
}

async function request(path: string, body: TomeAction | Record<string, never>): Promise<TomeSnapshot> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export function startTomeRun() {
  return request(runsPath, {});
}

export function updateTomeRun(runId: string, action: TomeAction) {
  return request(`${runsPath}/${encodeURIComponent(runId)}`, action);
}
