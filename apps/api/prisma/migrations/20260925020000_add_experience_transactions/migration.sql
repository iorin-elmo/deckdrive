CREATE TABLE "experience_transactions" (
  "id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "experience_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "experience_transactions_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "experience_transactions_player_id_idempotency_key_key"
  ON "experience_transactions"("player_id", "idempotency_key");
CREATE INDEX "experience_transactions_player_id_created_at_idx"
  ON "experience_transactions"("player_id", "created_at");

ALTER TABLE "experience_transactions"
  ADD CONSTRAINT "experience_transactions_player_id_fkey"
  FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
