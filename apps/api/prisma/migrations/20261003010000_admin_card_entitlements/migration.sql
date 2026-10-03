CREATE TABLE "admin_card_entitlements" (
  "id" UUID NOT NULL PRIMARY KEY,
  "player_id" UUID NOT NULL REFERENCES "players"("id"),
  "admin_user_id" UUID NOT NULL REFERENCES "users"("id"),
  "card_version_id" UUID NOT NULL REFERENCES "card_versions"("id"),
  "before_quantity" INTEGER NOT NULL,
  "after_quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "admin_card_entitlements_player_id_created_at_idx" ON "admin_card_entitlements"("player_id", "created_at");
