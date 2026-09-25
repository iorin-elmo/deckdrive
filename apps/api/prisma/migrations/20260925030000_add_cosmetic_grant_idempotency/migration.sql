ALTER TABLE "player_cosmetics"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "player_cosmetics_player_id_idempotency_key_key"
  ON "player_cosmetics"("player_id", "idempotency_key");
