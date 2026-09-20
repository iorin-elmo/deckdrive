-- Initial Phase 3 persistence schema. This migration is additive only.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE "MatchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "card_versions" (
    "id" UUID NOT NULL,
    "card_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "card_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_cards" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "card_version_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "player_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "player_cards_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "decks" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "card_data_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deck_cards" (
    "id" UUID NOT NULL,
    "deck_id" UUID NOT NULL,
    "card_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "deck_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deck_cards_position_non_negative" CHECK ("position" >= 0),
    CONSTRAINT "deck_cards_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "engine_version" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "card_data_version" TEXT NOT NULL,
    "format_version" INTEGER NOT NULL DEFAULT 1,
    "snapshot_interval" INTEGER NOT NULL DEFAULT 1,
    "seed" TEXT NOT NULL,
    "initial_state" JSONB NOT NULL,
    "final_state" JSONB,
    "checksum" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    CONSTRAINT "matches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "matches_format_version_positive" CHECK ("format_version" > 0),
    CONSTRAINT "matches_snapshot_interval_positive" CHECK ("snapshot_interval" > 0)
);

CREATE TABLE "match_players" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "player_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "deck_snapshot" JSONB NOT NULL,
    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_players_seat_between_one_and_two" CHECK ("seat" BETWEEN 1 AND 2)
);

CREATE TABLE "match_actions" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_actions_sequence_positive" CHECK ("sequence" > 0)
);

CREATE TABLE "match_events" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_events_sequence_positive" CHECK ("sequence" > 0)
);

CREATE TABLE "match_snapshots" (
    "id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "action_index" INTEGER NOT NULL,
    "event_sequence" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "match_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_snapshots_action_index_non_negative" CHECK ("action_index" >= 0),
    CONSTRAINT "match_snapshots_event_sequence_non_negative" CHECK ("event_sequence" >= 0)
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");
CREATE UNIQUE INDEX "card_versions_card_id_version_key" ON "card_versions"("card_id", "version");
CREATE INDEX "player_cards_player_id_idx" ON "player_cards"("player_id");
CREATE UNIQUE INDEX "player_cards_player_id_card_version_id_key" ON "player_cards"("player_id", "card_version_id");
CREATE INDEX "decks_player_id_updated_at_idx" ON "decks"("player_id", "updated_at");
CREATE UNIQUE INDEX "decks_player_id_name_key" ON "decks"("player_id", "name");
CREATE UNIQUE INDEX "deck_cards_deck_id_card_version_id_key" ON "deck_cards"("deck_id", "card_version_id");
CREATE UNIQUE INDEX "deck_cards_deck_id_position_key" ON "deck_cards"("deck_id", "position");
CREATE INDEX "matches_status_created_at_idx" ON "matches"("status", "created_at");
CREATE INDEX "matches_card_data_version_rules_version_engine_version_idx" ON "matches"("card_data_version", "rules_version", "engine_version");
CREATE INDEX "match_players_player_id_idx" ON "match_players"("player_id");
CREATE UNIQUE INDEX "match_players_match_id_player_id_key" ON "match_players"("match_id", "player_id");
CREATE UNIQUE INDEX "match_players_match_id_seat_key" ON "match_players"("match_id", "seat");
CREATE INDEX "match_actions_match_id_created_at_idx" ON "match_actions"("match_id", "created_at");
CREATE UNIQUE INDEX "match_actions_match_id_sequence_key" ON "match_actions"("match_id", "sequence");
CREATE INDEX "match_events_match_id_created_at_idx" ON "match_events"("match_id", "created_at");
CREATE UNIQUE INDEX "match_events_match_id_sequence_key" ON "match_events"("match_id", "sequence");
CREATE INDEX "match_snapshots_match_id_event_sequence_idx" ON "match_snapshots"("match_id", "event_sequence");
CREATE UNIQUE INDEX "match_snapshots_match_id_action_index_key" ON "match_snapshots"("match_id", "action_index");

ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_cards" ADD CONSTRAINT "player_cards_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_cards" ADD CONSTRAINT "player_cards_card_version_id_fkey" FOREIGN KEY ("card_version_id") REFERENCES "card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decks" ADD CONSTRAINT "decks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_version_id_fkey" FOREIGN KEY ("card_version_id") REFERENCES "card_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "match_actions" ADD CONSTRAINT "match_actions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_snapshots" ADD CONSTRAINT "match_snapshots_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
