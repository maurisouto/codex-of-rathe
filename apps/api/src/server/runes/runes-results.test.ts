import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ rows: [] as { outcome: string; clues: number; elapsedMs: number; completedAt: Date }[], raw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    runeResult: { findMany: vi.fn(async () => mocked.rows) },
    $queryRaw: (...args: unknown[]) => mocked.raw(...args),
  },
}));

import { getRuneLeaderboard, getRuneStats } from "./runes-results";

describe("Read the Runes result records", () => {
  beforeEach(() => {
    mocked.rows = [];
    mocked.raw.mockReset();
  });

  it("reports isolated wins, losses, win rate, clue distribution, and best win", async () => {
    mocked.rows = [
      { outcome: "correct", clues: 2, elapsedMs: 30_000, completedAt: new Date("2026-01-03") },
      { outcome: "incorrect", clues: 3, elapsedMs: 40_000, completedAt: new Date("2026-01-02") },
      { outcome: "correct", clues: 1, elapsedMs: 50_000, completedAt: new Date("2026-01-01") },
    ];
    mocked.raw.mockResolvedValue([{ rank: 2, userId: "user-1", displayName: "Player", clues: 1, elapsedMs: 50_000, listed: true }]);
    expect(await getRuneStats("user-1")).toEqual({
      games: 3,
      wins: 2,
      losses: 1,
      winRate: 2 / 3,
      winClueDistribution: [{ clues: 1, count: 1 }, { clues: 2, count: 1 }],
      best: { clues: 1, elapsedMs: 50_000, rank: 2 },
    });
    const query = String(mocked.raw.mock.calls[0]?.[0] ?? "");
    expect(query).toContain("ORDER BY b.clues ASC, b.\"elapsedMs\" ASC");
  });

  it("returns no personal stats for guests and uses only correct results for standings", async () => {
    expect(await getRuneStats(null)).toEqual({ games: 0, wins: 0, losses: 0, winRate: 0, winClueDistribution: [], best: null });
    mocked.raw.mockResolvedValue([]);
    await getRuneLeaderboard(null);
    const query = String(mocked.raw.mock.calls[0]?.[0] ?? "");
    expect(query).toContain("WHERE outcome = 'correct'");
    expect(query).toContain("rank() OVER (ORDER BY b.clues ASC, b.\"elapsedMs\" ASC)");
  });
});
