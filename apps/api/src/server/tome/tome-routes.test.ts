import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "@/server/http-app";
import { createTomeGame } from "./tome-game";
import { loadTomePool, type TomeArtwork } from "./tome-pool";
import { createTomeRoutes } from "./tome-routes";

const fixtures: TomeArtwork[] = Array.from({ length: 12 }, (_, i) => ({
  family: `family-${i}`,
  cardName: `Card ${i}`,
  artUrl: `data:image/webp;base64,${i}==`,
  facts: [{
    category: "artist",
    prompt: "Who illustrated this artwork?",
    answer: `Artist ${i}`,
    explanation: `Artist ${i} illustrated this artwork for Card ${i}.`,
    excluded: [],
  }],
}));

type Snapshot = ReturnType<ReturnType<typeof createTomeGame>["start"]>;

describe("Tome solo API", () => {
  const route = "/api/tome/runs";
  const testApp = new Hono().route("/api/tome", createTomeRoutes(createTomeGame(() => fixtures)));

  async function start() {
    const result = await testApp.request(route, { method: "POST" });
    expect(result.status).toBe(201);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    return result.json() as Promise<Snapshot>;
  }

  async function act(state: Snapshot, action: "answer" | "next" | "replace", choiceId?: string) {
    return testApp.request(`${route}/${state.runId}`, {
      method: "POST",
      body: JSON.stringify({ action, questionId: state.question?.id, choiceId }),
    });
  }

  it("serves a real crop from the standard API entry point without answer metadata", async () => {
    const response = await app.request(route, { method: "POST" });
    expect(response.status).toBe(201);
    const result = await response.json() as Snapshot;
    expect(result.question?.artUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result.question).toEqual({
      id: expect.any(String),
      prompt: expect.any(String),
      category: expect.any(String),
      artUrl: expect.any(String),
      choices: expect.any(Array),
    });
    expect(new Set(result.question?.choices.map(({ label }) => label)).size).toBe(4);
    expect(result.answers).toEqual([]);
  });

  it("scores eight unique artworks and allows retries without replaying a mutation", async () => {
    let state = await start();
    const seen = new Set<string>();
    expect((await act(state, "next")).status).toBe(409);
    for (let index = 0; index < 8; index++) {
      const { artUrl, choices } = state.question!;
      expect(seen.has(artUrl)).toBe(false);
      seen.add(artUrl);
      const correct = fixtures.find((art) => art.artUrl === artUrl)!.facts[0].answer;
      const selection = choices.find(({ label }) => index === 0 ? label !== correct : label === correct)!;
      const submitted = await act(state, "answer", selection.id);
      expect(submitted.status).toBe(200);
      const answered = await submitted.json() as Snapshot;
      expect(answered.status).toBe("answered");
      expect(answered.answers.at(-1)).toMatchObject({ selected: selection.label, correct });
      expect(await (await act(state, "answer", selection.id)).json()).toEqual(answered);
      const other = choices.find(({ id }) => id !== selection.id)!;
      expect(await (await act(state, "answer", other.id)).json()).toEqual(answered);
      expect((await act(state, "replace")).status).toBe(409);
      const next = await (await act(state, "next")).json() as Snapshot;
      expect(await (await act(state, "next")).json()).toEqual(next);
      state = next;
    }
    expect(state).toMatchObject({ status: "complete", score: 7, question: null, position: 8 });
    expect(state.answers).toHaveLength(8);
  });

  it("replaces an unanswered artwork without consuming the question and rejects invalid choices", async () => {
    const initial = await start();
    const response = await act(initial, "replace");
    expect(response.status).toBe(200);
    const replacement = await response.json() as Snapshot;
    expect(replacement).toMatchObject({ status: "question", position: 1, score: 0, answers: [] });
    expect(replacement.question?.artUrl).not.toBe(initial.question?.artUrl);
    expect(await (await act(initial, "replace")).json()).toEqual(replacement);
    expect((await act(replacement, "answer", initial.question?.choices[0].id)).status).toBe(400);
    expect((await act(initial, "answer", initial.question?.choices[0].id)).status).toBe(409);
  });

  it("returns 404 for an expired round and 503 for an undersized pool", () => {
    const clock = vi.fn(() => 0);
    const expiring = createTomeGame(() => fixtures, { ttlMs: 50, now: clock });
    const round = expiring.start();
    clock.mockReturnValue(50);
    expect(() => expiring.act(round.runId, { action: "replace", questionId: round.question!.id }))
      .toThrow(expect.objectContaining({ status: 404 }));
    expect(() => createTomeGame(() => fixtures.slice(0, 7)).start())
      .toThrow(expect.objectContaining({ status: 503 }));
  });

  it("deals all five supported categories from the real pool and excludes plausible alternate correct choices", () => {
    const pool = loadTomePool();
    const game = createTomeGame(() => pool);
    let state = game.start();
    const categories = new Set<string>();
    const families = new Set<string>();
    for (let index = 0; index < 8; index++) {
      const question = state.question!;
      categories.add(question.category);
      const matchingArt = pool.find(({ artUrl }) => artUrl === question.artUrl)!;
      expect(families.has(matchingArt.family)).toBe(false);
      families.add(matchingArt.family);
      const applicable = matchingArt.facts.filter(({ category }) => category === question.category);
      const answered = game.act(state.runId, { action: "answer", questionId: question.id, choiceId: question.choices[0].id });
      const correct = answered.answers.at(-1)!.correct;
      const fact = applicable.find(({ answer }) => answer === correct)!;
      expect(fact).toBeDefined();
      expect(question.choices.filter(({ label }) => label === correct)).toHaveLength(1);
      expect(question.choices.filter(({ label }) => label !== correct && fact.excluded.includes(label))).toEqual([]);
      state = game.act(state.runId, { action: "next", questionId: question.id });
    }
    expect(categories).toEqual(new Set(["artist", "class", "type", "set", "year"]));
  });
});

it("binds ranked runs to their account and retries a failed save with the server score", async () => {
  const recordResult = vi.fn(async (_runId: string, _userId: string, _score: number) => {});
  recordResult.mockRejectedValueOnce(new Error("Database unavailable"));
  const getLeaderboard = vi.fn(async (_userId: string | null) => ({ entries: [], personalBest: null }));
  const testApp = createTomeRoutes(createTomeGame(() => fixtures), {
    resolveUser: async (headers) => {
      const token = headers.get("Authorization");
      return token === "Bearer player" ? "player" : token === "Bearer other" ? "other" : null;
    },
    recordResult,
    getLeaderboard,
  });
  const headers = { Authorization: "Bearer player" };
  expect((await testApp.request("/runs", { method: "POST", headers: { Authorization: "invalid" } })).status).toBe(401);
  expect((await testApp.request("/leaderboard")).status).toBe(200);
  expect((await testApp.request("/leaderboard", { headers })).status).toBe(200);
  expect(getLeaderboard.mock.calls).toEqual([[null], ["player"]]);

  let state = await (await testApp.request("/runs", { method: "POST", headers })).json() as Snapshot;
  function act(action: "answer" | "next", choiceId?: string, auth: Record<string, string> = headers) {
    return testApp.request(`/runs/${state.runId}`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ action, questionId: state.question!.id, choiceId, score: 0 }),
    });
  }

  expect((await act("answer", state.question!.choices[0].id, {})).status).toBe(404);
  expect((await act("answer", state.question!.choices[0].id, { Authorization: "Bearer other" })).status).toBe(404);
  for (let i = 0; i < 8; i++) {
    const question = state.question!;
    const correct = fixtures.find(({ artUrl }) => artUrl === question.artUrl)!.facts[0].answer;
    const choice = question.choices.find(({ label }) => label === correct)!;
    expect((await act("answer", choice.id)).status).toBe(200);
    expect(recordResult).not.toHaveBeenCalled();
    if (i === 7) expect((await act("next")).status).toBe(503);
    const response = await act("next");
    expect(response.status).toBe(200);
    state = await response.json() as Snapshot;
  }
  expect(state).toMatchObject({ status: "complete", score: 8 });
  expect(recordResult.mock.calls).toEqual([[state.runId, "player", 8], [state.runId, "player", 8]]);
});
