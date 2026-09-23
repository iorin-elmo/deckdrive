-- Phase 6 pack openings: purchase, grants, duplicate conversion and opening log
-- are committed atomically by the application transaction.
ALTER TABLE "currency_transactions"
    DROP CONSTRAINT "currency_transactions_amount_positive";

ALTER TABLE "currency_transactions"
    ADD COLUMN "reference_id" UUID;

CREATE TYPE "PackProduct" AS ENUM ('NORMAL_PACK', 'RARE_PACK', 'BOX', 'WEEKLY_BOX', 'MONTHLY_BUNDLE');

CREATE TABLE "pack_openings" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "product" "PackProduct" NOT NULL,
    "gem_cost" INTEGER NOT NULL,
    "seed" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pack_openings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pack_openings_gem_cost_nonnegative" CHECK ("gem_cost" >= 0)
);

CREATE UNIQUE INDEX "pack_openings_player_id_idempotency_key_key"
    ON "pack_openings"("player_id", "idempotency_key");
CREATE INDEX "pack_openings_player_id_created_at_idx"
    ON "pack_openings"("player_id", "created_at");

ALTER TABLE "pack_openings"
    ADD CONSTRAINT "pack_openings_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
