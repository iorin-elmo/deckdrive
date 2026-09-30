CREATE TYPE "MissionCadence" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "MissionMetric" AS ENUM ('CPU_BATTLE', 'PVP_BATTLE', 'CARD_PLAY', 'DAMAGE', 'BLOCK', 'WIN');
CREATE TYPE "CosmeticKind" AS ENUM ('CARD_FRAME', 'CARD_FULL_ART_FX', 'CARD_ANIMATION', 'HOLOGRAM', 'LEADER_SKIN', 'PLAYMAT', 'CARD_SLEEVE', 'TITLE', 'PROFILE_DECORATION');

ALTER TABLE "players" ADD COLUMN "experience" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "missions" (
  "id" TEXT NOT NULL,
  "cadence" "MissionCadence" NOT NULL,
  "metric" "MissionMetric" NOT NULL,
  "target" INTEGER NOT NULL,
  "reward_currency" "Currency" NOT NULL,
  "reward_amount" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "missions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "missions_target_positive" CHECK ("target" > 0),
  CONSTRAINT "missions_reward_amount_positive" CHECK ("reward_amount" > 0)
);

CREATE TABLE "player_missions" (
  "id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "mission_id" TEXT NOT NULL,
  "period_start" TIMESTAMPTZ(6) NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "claimed_at" TIMESTAMPTZ(6),
  CONSTRAINT "player_missions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "player_missions_progress_non_negative" CHECK ("progress" >= 0)
);

CREATE TABLE "login_reward_claims" (
  "id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "day" DATE NOT NULL,
  "cycle_day" INTEGER NOT NULL,
  "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_reward_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "login_reward_claims_cycle_day_range" CHECK ("cycle_day" BETWEEN 1 AND 7)
);

CREATE TABLE "cosmetics" (
  "id" TEXT NOT NULL,
  "kind" "CosmeticKind" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cosmetics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_cosmetics" (
  "id" UUID NOT NULL,
  "player_id" UUID NOT NULL,
  "cosmetic_id" TEXT NOT NULL,
  "acquired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_cosmetics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "player_missions_player_id_mission_id_period_start_key" ON "player_missions"("player_id", "mission_id", "period_start");
CREATE INDEX "player_missions_player_id_period_start_idx" ON "player_missions"("player_id", "period_start");
CREATE UNIQUE INDEX "login_reward_claims_player_id_day_key" ON "login_reward_claims"("player_id", "day");
CREATE INDEX "login_reward_claims_player_id_claimed_at_idx" ON "login_reward_claims"("player_id", "claimed_at");
CREATE UNIQUE INDEX "player_cosmetics_player_id_cosmetic_id_key" ON "player_cosmetics"("player_id", "cosmetic_id");
CREATE INDEX "player_cosmetics_player_id_acquired_at_idx" ON "player_cosmetics"("player_id", "acquired_at");

ALTER TABLE "player_missions" ADD CONSTRAINT "player_missions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_missions" ADD CONSTRAINT "player_missions_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "login_reward_claims" ADD CONSTRAINT "login_reward_claims_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_cosmetics" ADD CONSTRAINT "player_cosmetics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_cosmetics" ADD CONSTRAINT "player_cosmetics_cosmetic_id_fkey" FOREIGN KEY ("cosmetic_id") REFERENCES "cosmetics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
