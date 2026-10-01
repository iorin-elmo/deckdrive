-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "RatingOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- AlterEnum
ALTER TYPE "MatchMode" ADD VALUE 'RANKED';

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "status" "SeasonStatus" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "initial_rating" DOUBLE PRECISION NOT NULL,
    "reset_retention" DOUBLE PRECISION NOT NULL,
    "rating_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_season_ratings" (
    "season_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "completed_games" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "player_season_ratings_pkey" PRIMARY KEY ("season_id","player_id")
);

-- CreateTable
CREATE TABLE "ranked_matches" (
    "match_id" TEXT NOT NULL,
    "season_id" UUID NOT NULL,
    "rating_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranked_matches_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "ranked_match_players" (
    "match_id" TEXT NOT NULL,
    "player_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "rating_at_start" DOUBLE PRECISION NOT NULL,
    "completed_games_at_start" INTEGER NOT NULL,

    CONSTRAINT "ranked_match_players_pkey" PRIMARY KEY ("match_id","player_id")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "season_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "opponent_id" UUID NOT NULL,
    "outcome" "RatingOutcome" NOT NULL,
    "rating_before" DOUBLE PRECISION NOT NULL,
    "rating_after" DOUBLE PRECISION NOT NULL,
    "rating_at_start" DOUBLE PRECISION NOT NULL,
    "opponent_rating_at_start" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "k" DOUBLE PRECISION NOT NULL,
    "expected_score" DOUBLE PRECISION NOT NULL,
    "actual_score" DOUBLE PRECISION NOT NULL,
    "damage_ratio" DOUBLE PRECISION NOT NULL,
    "damage_dealt" DOUBLE PRECISION NOT NULL,
    "opponent_initial_hp" DOUBLE PRECISION NOT NULL,
    "rating_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_abuse_flags" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_abuse_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seasons_status_starts_at_idx" ON "seasons"("status", "starts_at");

-- A season transition and match creation must agree on a single active season.
CREATE UNIQUE INDEX "seasons_one_active_key" ON "seasons" ((true)) WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "player_season_ratings_player_id_season_id_idx" ON "player_season_ratings"("player_id", "season_id");

-- CreateIndex
CREATE INDEX "ranked_matches_season_id_created_at_idx" ON "ranked_matches"("season_id", "created_at");

-- CreateIndex
CREATE INDEX "ranked_match_players_player_id_match_id_idx" ON "ranked_match_players"("player_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "ranked_match_players_match_id_seat_key" ON "ranked_match_players"("match_id", "seat");

-- CreateIndex
CREATE INDEX "rating_history_player_id_season_id_created_at_idx" ON "rating_history"("player_id", "season_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_history_match_id_player_id_key" ON "rating_history"("match_id", "player_id");

-- CreateIndex
CREATE INDEX "rating_abuse_flags_player_id_created_at_idx" ON "rating_abuse_flags"("player_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_abuse_flags_match_id_player_id_type_key" ON "rating_abuse_flags"("match_id", "player_id", "type");

-- AddForeignKey
ALTER TABLE "player_season_ratings" ADD CONSTRAINT "player_season_ratings_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_ratings" ADD CONSTRAINT "player_season_ratings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_matches" ADD CONSTRAINT "ranked_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_matches" ADD CONSTRAINT "ranked_matches_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_match_players" ADD CONSTRAINT "ranked_match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "ranked_matches"("match_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_match_players" ADD CONSTRAINT "ranked_match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_match_players" ADD CONSTRAINT "ranked_match_players_match_id_player_id_fkey" FOREIGN KEY ("match_id", "player_id") REFERENCES "match_players"("match_id", "player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_abuse_flags" ADD CONSTRAINT "rating_abuse_flags_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_abuse_flags" ADD CONSTRAINT "rating_abuse_flags_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_dates_check" CHECK ("starts_at" < "ends_at");
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_reset_retention_check" CHECK ("reset_retention" >= 0 AND "reset_retention" <= 1);
ALTER TABLE "player_season_ratings" ADD CONSTRAINT "player_season_ratings_completed_games_check" CHECK ("completed_games" >= 0);
ALTER TABLE "ranked_match_players" ADD CONSTRAINT "ranked_match_players_seat_check" CHECK ("seat" BETWEEN 1 AND 2);
ALTER TABLE "ranked_match_players" ADD CONSTRAINT "ranked_match_players_completed_games_check" CHECK ("completed_games_at_start" >= 0);
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_loss_delta_check" CHECK ("outcome" <> 'LOSS' OR "delta" <= 0);
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_damage_ratio_check" CHECK ("damage_ratio" BETWEEN 0 AND 1);
