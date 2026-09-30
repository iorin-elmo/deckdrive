-- Ownership and grants have different cardinalities: a player owns a cosmetic once,
-- but may receive that cosmetic through multiple independently idempotent rewards.
CREATE TABLE "cosmetic_grants" (
  "id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "cosmetic_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cosmetic_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cosmetic_grants_player_id_idempotency_key_key"
  ON "cosmetic_grants"("player_id", "idempotency_key");
CREATE INDEX "cosmetic_grants_player_id_created_at_idx"
  ON "cosmetic_grants"("player_id", "created_at");

ALTER TABLE "cosmetic_grants"
  ADD CONSTRAINT "cosmetic_grants_player_id_fkey"
  FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cosmetic_grants"
  ADD CONSTRAINT "cosmetic_grants_cosmetic_id_fkey"
  FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve all ownership history that predates the separate grant ledger.
INSERT INTO "cosmetic_grants" ("id", "player_id", "cosmetic_id", "source", "idempotency_key", "created_at")
SELECT "id", "player_id", "cosmetic_id", "source", "idempotency_key", "acquired_at"
FROM "player_cosmetics";
