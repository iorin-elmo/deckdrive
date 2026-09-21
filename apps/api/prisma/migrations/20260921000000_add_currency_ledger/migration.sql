-- Phase 4 reward ledger. Appends only; balances are derived from these entries.
CREATE TYPE "Currency" AS ENUM ('GEM', 'EXCHANGE_POINT');

CREATE TABLE "currency_transactions" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "currency_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "currency_transactions_amount_non_zero" CHECK ("amount" <> 0)
);

CREATE UNIQUE INDEX "currency_transactions_player_id_idempotency_key_key"
    ON "currency_transactions"("player_id", "idempotency_key");
CREATE INDEX "currency_transactions_player_id_created_at_idx"
    ON "currency_transactions"("player_id", "created_at");

ALTER TABLE "currency_transactions"
    ADD CONSTRAINT "currency_transactions_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
