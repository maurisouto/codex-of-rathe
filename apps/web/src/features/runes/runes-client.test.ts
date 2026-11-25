import { afterEach, expect, it, vi } from "vitest";
import { buildGameApiRequestHeaders } from "@/lib/auth/game-api-headers";
import { isNoActiveRun, requestRunes } from "./runes-client";

vi.mock("@/lib/auth/game-api-headers", () => ({ buildGameApiRequestHeaders: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("times out before a stalled session can send a late start request", async () => {
  vi.useFakeTimers();
  let finishSession!: (headers: Headers) => void;
  vi.mocked(buildGameApiRequestHeaders).mockReturnValue(new Promise(resolve => { finishSession = resolve; }));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const outcome = vi.fn();
  const request = requestRunes("/api/runes/runs", { mode: "ranked" }).catch(outcome);
  await vi.advanceTimersByTimeAsync(12_001);
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/timed out/i) }));
  finishSession(new Headers());
  await request;
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["No active Read the Runes round.", true],
  ["Route not found", false],
  [null, false],
])("recognizes only the API's empty-round response (%s)", async (message, emptyRound) => {
  vi.mocked(buildGameApiRequestHeaders).mockResolvedValue(new Headers());
  const response = message
    ? Response.json({ error: message }, { status: 404 })
    : new Response("<html>Not found</html>", { status: 404 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(requestRunes("/api/runes/runs").catch(isNoActiveRun)).resolves.toBe(emptyRound);
});

it("uses the remaining session deadline while reading the response body", async () => {
  vi.useFakeTimers();
  vi.mocked(buildGameApiRequestHeaders).mockImplementation(() => new Promise(resolve => {
    setTimeout(() => resolve(new Headers()), 8_000);
  }));
  const fetchMock = vi.fn(async (_path: string, { signal }: RequestInit) => ({
    ok: true,
    json: () => new Promise((_, reject) => {
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const result = requestRunes("/api/runes/runs").catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(8_001);
  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(4_000);
  await expect(result).resolves.toMatch(/timed out/i);
});
