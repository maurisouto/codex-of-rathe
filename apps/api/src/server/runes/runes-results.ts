import { prisma } from "@/lib/prisma";

type RankedResult = { rank: number; userId: string; displayName: string; clues: number; elapsedMs: number };

export async function recordRuneResult(runId: string, userId: string, outcome: "correct" | "incorrect", clues: number, elapsedMs: number) {
  await prisma.runeResult.upsert({
    where: { runId },
    create: { runId, userId, outcome, clues, elapsedMs },
    update: {},
  });
}

export async function getRuneLeaderboard(userId: string | null) {
  const rows = await prisma.$queryRaw<(RankedResult & { listed: boolean })[]>`
    WITH best AS (
      SELECT user_id, min(clues) AS clues FROM rune_results WHERE outcome = 'correct' GROUP BY user_id
    ), best_runs AS (
      SELECT r.user_id, r.clues, min(r.elapsed_ms) AS "elapsedMs"
      FROM rune_results r JOIN best b ON b.user_id = r.user_id AND b.clues = r.clues
      WHERE r.outcome = 'correct'
      GROUP BY r.user_id, r.clues
    ), ranked AS (
      SELECT b.user_id AS "userId", users.display_name AS "displayName", b.clues, b."elapsedMs",
        (rank() OVER (ORDER BY b.clues ASC, b."elapsedMs" ASC))::int AS rank
      FROM best_runs b JOIN users ON users.id = b.user_id
    ), top_scores AS (
      SELECT * FROM ranked ORDER BY rank, "userId" LIMIT 50
    )
    SELECT *, true AS listed FROM top_scores
    UNION ALL
    SELECT *, false AS listed FROM ranked WHERE "userId" = ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM top_scores WHERE "userId" = ${userId}::uuid)
    ORDER BY rank, "userId"
  `;
  const entries: RankedResult[] = [];
  let personalBest: RankedResult | null = null;
  for (const { listed, ...row } of rows) {
    if (listed) entries.push(row);
    if (row.userId === userId) personalBest = row;
  }
  return { entries, personalBest };
}

export async function getRuneStats(userId: string | null) {
  if (!userId) return { games: 0, wins: 0, losses: 0, winRate: 0, winClueDistribution: [], best: null };
  const [rows, leaderboard] = await Promise.all([
    prisma.runeResult.findMany({ where: { userId }, select: { outcome: true, clues: true, elapsedMs: true }, orderBy: { completedAt: "desc" } }),
    getRuneLeaderboard(userId),
  ]);
  const wins = rows.filter(({ outcome }) => outcome === "correct");
  const losses = rows.length - wins.length;
  const distribution = new Map<number, number>();
  for (const row of wins) distribution.set(row.clues, (distribution.get(row.clues) ?? 0) + 1);
  const bestWin = wins.sort((a, b) => a.clues - b.clues || a.elapsedMs - b.elapsedMs)[0];
  return {
    games: rows.length,
    wins: wins.length,
    losses,
    winRate: rows.length ? wins.length / rows.length : 0,
    winClueDistribution: [...distribution].sort(([a], [b]) => a - b).map(([clues, count]) => ({ clues, count })),
    best: bestWin ? { clues: bestWin.clues, elapsedMs: bestWin.elapsedMs, rank: leaderboard.personalBest?.rank ?? null } : null,
  };
}
