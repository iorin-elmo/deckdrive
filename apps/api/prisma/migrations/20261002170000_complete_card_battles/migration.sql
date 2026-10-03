CREATE TABLE "alpha_battles" (
  "id" UUID NOT NULL PRIMARY KEY,
  "host_id" UUID NOT NULL REFERENCES "players"("id"),
  "guest_id" UUID REFERENCES "players"("id"),
  "mode" TEXT NOT NULL,
  "invite_code" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "decks" JSONB NOT NULL,
  "definitions" JSONB NOT NULL,
  "state" JSONB,
  "inputs" JSONB NOT NULL DEFAULT '[]',
  "receipts" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "alpha_battles_status_mode_created_at_idx" ON "alpha_battles"("status", "mode", "created_at");
CREATE INDEX "alpha_battles_host_id_created_at_idx" ON "alpha_battles"("host_id", "created_at");
