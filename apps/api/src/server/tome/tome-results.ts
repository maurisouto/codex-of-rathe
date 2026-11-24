import { prisma } from "@/lib/prisma";

type RankedScore = { rank: number; userId: string; displayName: string; score: number };

export async function recordTomeResult(runId: string, userId: string, score: number) {
  // The final action can be retried after a timeout or a lost response.
  await prisma.tomeResult.createMany({ data: { runId, userId, score }, skipDuplicates: true });
}

export async function getTomeLeaderboard(userId: string | null) {
  const rows = await prisma.$queryRaw<(RankedScore & { listed: boolean })[]>`
    WITH best AS (
      SELECT user_id, max(score) AS score FROM tome_results GROUP BY user_id
    ), ranked AS (
      SELECT best.user_id AS "userId", users.display_name AS "displayName", best.score,
        (rank() OVER (ORDER BY best.score DESC))::int AS rank
      FROM best JOIN users ON users.id = best.user_id
    ), top_scores AS (
      SELECT * FROM ranked ORDER BY rank, "userId" LIMIT 50
    )
    SELECT *, true AS listed FROM top_scores
    UNION ALL
    SELECT *, false AS listed FROM ranked WHERE "userId" = ${userId}::uuid
      AND NOT EXISTS (SELECT 1 FROM top_scores WHERE "userId" = ${userId}::uuid)
    ORDER BY rank, "userId"
  `;

  const entries: RankedScore[] = [];
  let personalBest: RankedScore | null = null;
  for (const { listed, ...row } of rows) {
    if (listed) entries.push(row);
    if (row.userId === userId) personalBest = row;
  }
  return { entries, personalBest };
}
