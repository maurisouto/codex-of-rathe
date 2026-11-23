CREATE TABLE "chronicle_best_scores" (
    "user_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    CONSTRAINT "chronicle_best_scores_pkey" PRIMARY KEY ("user_id", "mode"),
    CONSTRAINT "chronicle_best_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chronicle_best_scores_mode_score_check" CHECK (
        ("mode" = 'streak' AND "score" BETWEEN 1 AND 6)
        OR ("mode" = 'timed' AND "score" BETWEEN 0 AND 29999)
        OR ("mode" = 'untimed' AND "score" >= 0)
    )
);

CREATE INDEX "chronicle_best_scores_mode_score_idx" ON "chronicle_best_scores" ("mode", "score");
