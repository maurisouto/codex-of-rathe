import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { RunesSnapshot } from "./runes-client";
import { RunesPlay } from "./runes-play";

const state = vi.hoisted(() => ({ snapshot: null as RunesSnapshot | null, calls: 0 }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => react.useState(state.calls++ === 0 ? state.snapshot : initial) };
});
vi.mock("@/components/auth/auth-context", () => ({ useAuth: () => ({ user: null }) }));

beforeEach(() => { state.calls = 0; state.snapshot = null; });
const clue = (number: number, value: string) => ({ number, label: "Class", value });
const render = (snapshot: RunesSnapshot | null) => {
  state.snapshot = snapshot;
  state.calls = 0;
  return renderToStaticMarkup(createElement(RunesPlay));
};

it("renders the current run's authoritative count and history across consecutive rounds", () => {
  const first: RunesSnapshot = { runId: "first", mode: "ranked", status: "active", artworks: [], cluesUsed: 2, cluesRemaining: 0, elapsedMs: 0, clues: [clue(1, "Old class"), clue(2, "Old artist")] };
  expect(render(first)).toContain("Clues used: 2");
  const second: RunesSnapshot = { ...first, runId: "second", cluesUsed: 1, cluesRemaining: 3, clues: [clue(1, "New class")] };
  const next = render(second);
  expect(next).toContain("Clues used: 1");
  expect(next).toContain("Remaining: 3");
  expect(next).toContain("New class");
  expect(next).not.toContain("Old class");
  expect(next).not.toContain("Old artist");
  // Review data must not become the count; the server owns cluesUsed.
  expect(render({ ...second, clues: [...second.clues, clue(2, "Review only")] })).toContain("Clues used: 1");
});

it("keeps the illustrated guide without a tutorial CTA or in-round enlargement", () => {
  const setup = render(null);
  expect(setup).toContain("Start round");
  expect(setup).toContain("data-runes-example");
  expect(setup).not.toContain("Start guided tutorial");
  expect(setup).not.toContain("tutorial-description");
  const active = render({ runId: "new", mode: "ranked", status: "active", artworks: [{ id: "art", label: "Artwork A", cropUrl: "/runes/crops/pool-01.webp" }], cluesUsed: 1, cluesRemaining: 3, clues: [clue(1, "Runeblade")], elapsedMs: 0 });
  expect(active).toContain("How to play");
  expect(active).not.toContain("Enlarge");
  expect(active).not.toContain("Full card:");
});
