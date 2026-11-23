import { prisma } from "@/lib/prisma";
import type { ChronicleMode } from "./chronicle-game";

type RankedScore = { rank: number; userId: string; displayName: string; score: number };

export async function recordChronicleBest(
  userId: string,
  mode: ChronicleMode,
  score: number,
) {
  await prisma.$executeRaw`
    INSERT INTO chronicle_best_scores ("user_id", "mode", "score")
    VALUES (${userId}::uuid, ${mode}, ${score})
    ON CONFLICT ("user_id", "mode") DO UPDATE
    SET "score" = EXCLUDED."score"
    WHERE CASE WHEN EXCLUDED."mode" = 'streak'
      THEN EXCLUDED."score" > chronicle_best_scores."score"
      ELSE EXCLUDED."score" < chronicle_best_scores."score"
    END
  `;
}

export async function getChronicleLeaderboard(mode: ChronicleMode, userId: string | null) {
  const rows = await prisma.$queryRaw<(RankedScore & { listed: boolean })[]>`
    WITH ranked AS (
      SELECT
        s."user_id" AS "userId",
        u."display_name" AS "displayName",
        s."score",
        (rank() OVER (ORDER BY CASE WHEN s."mode" = 'streak' THEN -s."score" ELSE s."score" END))::int AS rank
      FROM chronicle_best_scores s
      JOIN users u ON u.id = s.user_id
      WHERE s."mode" = ${mode}
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
