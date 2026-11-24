CREATE TABLE "tome_results" (
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" INTEGER NOT NULL CHECK ("score" BETWEEN 0 AND 8),
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tome_results_pkey" PRIMARY KEY ("run_id"),
    CONSTRAINT "tome_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "tome_results_user_id_score_idx" ON "tome_results"("user_id", "score");
