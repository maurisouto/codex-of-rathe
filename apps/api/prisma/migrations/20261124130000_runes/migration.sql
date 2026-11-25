CREATE TABLE "rune_runs" (
    "id" UUID NOT NULL,
    "owner_key" TEXT NOT NULL,
    "user_id" UUID,
    "status" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rune_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rune_results" (
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "clues" INTEGER NOT NULL,
    "elapsed_ms" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rune_results_pkey" PRIMARY KEY ("run_id")
);

CREATE INDEX "rune_runs_owner_key_status_expires_at_idx" ON "rune_runs"("owner_key", "status", "expires_at");
CREATE INDEX "rune_results_user_id_outcome_clues_elapsed_ms_idx" ON "rune_results"("user_id", "outcome", "clues", "elapsed_ms");

ALTER TABLE "rune_runs" ADD CONSTRAINT "rune_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rune_results" ADD CONSTRAINT "rune_results_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rune_runs" ADD CONSTRAINT "rune_runs_status_check"
  CHECK ("status" IN ('loading', 'active', 'complete', 'closed'));
ALTER TABLE "rune_results" ADD CONSTRAINT "rune_results_outcome_check"
  CHECK ("outcome" IN ('correct', 'incorrect'));
ALTER TABLE "rune_results" ADD CONSTRAINT "rune_results_score_check"
  CHECK ("clues" >= 1 AND "elapsed_ms" >= 0);
