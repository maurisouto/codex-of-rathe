import { randomInt, randomUUID } from "node:crypto";
import type { TomeArtwork, TomeCategory, TomeFact } from "./tome-pool";

const TOTAL = 8;
const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_RUNS = 1_000;
const MAX_COMPLETED_RUNS = 1_000;

type Choice = { id: string; label: string };
type Question = {
  id: string;
  artwork: TomeArtwork;
  fact: TomeFact;
  choices: Choice[];
  correctId: string;
};
type Answer = {
  position: number;
  prompt: string;
  selected: string;
  correct: string;
  cardName: string;
  explanation: string;
};
export type TomeAction =
  | { action: "answer"; questionId: string; choiceId: string }
  | { action: "next" | "replace"; questionId: string };
type Run = {
  userId: string | null;
  expiresAt: number;
  questions: Question[];
  answers: Answer[];
  replaced: Question[];
  position: number;
  lastAction?: TomeAction;
};

export class TomeError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, message: string) {
    super(message);
  }
}

function shuffled<T>(items: readonly T[], pick: (max: number) => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function labelKey(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function labelsByCategory(pool: readonly TomeArtwork[]): Map<TomeCategory, Map<string, string>> {
  const labels = new Map<TomeCategory, Map<string, string>>();
  for (const { facts } of pool) {
    for (const { category, answer } of facts) {
      const candidates = labels.get(category) ?? new Map<string, string>();
      candidates.set(labelKey(answer), answer);
      labels.set(category, candidates);
    }
  }
  return labels;
}

function distractorsFor(fact: TomeFact, labels: Map<TomeCategory, Map<string, string>>): string[] {
  const excluded = new Set([fact.answer, ...fact.excluded].map(labelKey));
  return [...(labels.get(fact.category) ?? [])]
    .filter(([value]) => !excluded.has(value))
    .map(([, label]) => label);
}

function snapshot(runId: string, run: Run) {
  const question = run.questions[run.position];
  return {
    runId,
    total: TOTAL,
    position: Math.min(run.position + 1, TOTAL),
    status: !question ? "complete" as const : run.answers[run.position] ? "answered" as const : "question" as const,
    score: run.answers.filter(({ selected, correct }) => selected === correct).length,
    question: question ? {
      id: question.id,
      category: question.fact.category,
      prompt: question.fact.prompt,
      artUrl: question.artwork.artUrl,
      choices: question.choices,
    } : null,
    answers: [...run.answers],
  };
}

type CompletedRun = {
  userId: string | null;
  expiresAt: number;
  finalQuestionId: string;
  result: ReturnType<typeof snapshot>;
};

function sameAction(previous: TomeAction, next: TomeAction): boolean {
  if (previous.action !== next.action || previous.questionId !== next.questionId) return false;
  return previous.action !== "answer" || (next.action === "answer" && previous.choiceId === next.choiceId);
}

export function createTomeGame(
  getPool: () => readonly TomeArtwork[],
  {
    now = Date.now,
    pick = randomInt,
    ttlMs = RUN_TTL_MS,
    maxRuns = MAX_RUNS,
    retryTtlMs = RUN_TTL_MS,
    maxCompletedRuns = MAX_COMPLETED_RUNS,
  } = {},
) {
  const runs = new Map<string, Run>();
  const completedRuns = new Map<string, CompletedRun>();

  function deal(used: readonly Question[], category?: TomeCategory): Question {
    const pool = getPool();
    const labels = labelsByCategory(pool);
    const usedFamilies = new Set(used.map(({ artwork }) => artwork.family));
    const usedArt = new Set(used.map(({ artwork }) => artwork.artUrl));

    for (const artwork of shuffled(pool, pick)) {
      if (usedFamilies.has(artwork.family) || usedArt.has(artwork.artUrl)) continue;
      for (const fact of shuffled(artwork.facts, pick)) {
        if (category && fact.category !== category) continue;
        const candidates = distractorsFor(fact, labels);
        if (candidates.length < 3) continue;
        const correct = { id: randomUUID(), label: fact.answer };
        const other = shuffled(candidates, pick).slice(0, 3).map((label) => ({ id: randomUUID(), label }));
        const choices = shuffled([correct, ...other], pick);
        return { id: randomUUID(), artwork, fact, choices, correctId: correct.id };
      }
    }
    if (category) return deal(used);
    throw new TomeError(503, "The Tome needs more verified artwork to open another question.");
  }

  function start(userId: string | null = null) {
    const time = now();
    for (const [id, run] of runs) {
      if (run.expiresAt <= time) runs.delete(id);
    }
    for (const [id, run] of completedRuns) {
      if (run.expiresAt <= time) completedRuns.delete(id);
    }
    if (runs.size >= maxRuns) throw new TomeError(503, "The Tome is busy. Try again in a moment.");
    const runId = randomUUID();
    const questions: Question[] = [];
    const categories = shuffled([...labelsByCategory(getPool()).keys()], pick);
    for (let i = 0; i < TOTAL; i++) {
      questions.push(deal(questions, categories[i % categories.length]));
    }
    const run: Run = { userId, expiresAt: time + ttlMs, questions, answers: [], replaced: [], position: 0 };
    runs.set(runId, run);
    return snapshot(runId, run);
  }

  function act(runId: string, action: TomeAction, userId: string | null = null) {
    const time = now();
    const completed = completedRuns.get(runId);
    if (completed && completed.expiresAt > time) {
      if (completed.userId !== userId) {
        throw new TomeError(404, "This trivia session is unavailable for this account.");
      }
      if (action.action !== "next" || action.questionId !== completed.finalQuestionId) {
        throw new TomeError(409, "This question is no longer active.");
      }
      return completed.result;
    }
    if (completed) completedRuns.delete(runId);

    const run = runs.get(runId);
    if (!run || run.expiresAt <= time) {
      runs.delete(runId);
      throw new TomeError(404, "This round has expired. Start a new round to play again.");
    }

    if (run.userId !== userId) {
      throw new TomeError(404, "This trivia session is unavailable for this account.");
    }

    if (run.lastAction && sameAction(run.lastAction, action)) return snapshot(runId, run);

    const question = run.questions[run.position];
    if (!question || question.id !== action.questionId) {
      throw new TomeError(409, "This question is no longer active.");
    }
    const answered = !!run.answers[run.position];
    if (action.action === "next") {
      if (!answered) throw new TomeError(409, "Check an answer before moving on.");
      run.position++;
    } else {
      if (action.action === "replace") {
        if (answered) throw new TomeError(409, "You already answered this question.");
        const replacement = deal([...run.questions, ...run.replaced], question.fact.category);
        run.questions[run.position] = replacement;
        run.replaced.push(question);
      } else if (action.action === "answer") {
        const selected = question.choices.find(({ id }) => id === action.choiceId);
        if (!selected) throw new TomeError(400, "Choose one of this question's four answers.");
        if (answered) return snapshot(runId, run);
        run.answers.push({
          position: run.position + 1,
          prompt: question.fact.prompt,
          selected: selected.label,
          correct: question.fact.answer,
          cardName: question.artwork.cardName,
          explanation: question.fact.explanation,
        });
      }
    }
    run.lastAction = action;
    const result = snapshot(runId, run);
    if (result.status === "complete") {
      // Release the active slot before the route awaits persistence.
      runs.delete(runId);
      completedRuns.set(runId, {
        userId,
        expiresAt: time + retryTtlMs,
        finalQuestionId: question.id,
        result,
      });
      if (completedRuns.size > maxCompletedRuns) {
        const oldest = completedRuns.keys().next().value;
        if (oldest !== undefined) completedRuns.delete(oldest);
      }
    }
    return result;
  }

  return { start, act };
}
