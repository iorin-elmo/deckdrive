CREATE TYPE "RankedQueueStatus" AS ENUM ('WAITING', 'MATCHED', 'EXPIRED');

CREATE TABLE "ranked_queue_entries" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "deck_data" JSONB NOT NULL,
    "card_data_version" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "status" "RankedQueueStatus" NOT NULL DEFAULT 'WAITING',
    "match_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "ranked_queue_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ranked_queue_entries_status_match_check" CHECK (
      ("status" = 'MATCHED' AND "match_id" IS NOT NULL)
      OR ("status" <> 'MATCHED' AND "match_id" IS NULL)
    ),
    CONSTRAINT "ranked_queue_entries_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE INDEX "ranked_queue_entries_status_season_id_card_data_version_cre_idx"
    ON "ranked_queue_entries"("status", "season_id", "card_data_version", "created_at");
CREATE INDEX "ranked_queue_entries_player_id_created_at_idx"
    ON "ranked_queue_entries"("player_id", "created_at");
CREATE INDEX "ranked_queue_entries_match_id_idx" ON "ranked_queue_entries"("match_id");
CREATE UNIQUE INDEX "ranked_queue_entries_one_waiting_player_idx"
    ON "ranked_queue_entries"("player_id") WHERE "status" = 'WAITING';

ALTER TABLE "ranked_queue_entries" ADD CONSTRAINT "ranked_queue_entries_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ranked_queue_entries" ADD CONSTRAINT "ranked_queue_entries_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ranked_queue_entries" ADD CONSTRAINT "ranked_queue_entries_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
