CREATE TYPE "MatchMode" AS ENUM ('CASUAL', 'PRIVATE');

ALTER TABLE "matches"
ADD COLUMN "mode" "MatchMode",
ADD COLUMN "queue_id" TEXT,
ADD COLUMN "invite_code" TEXT;

CREATE UNIQUE INDEX "matches_queue_id_key" ON "matches"("queue_id");
CREATE UNIQUE INDEX "matches_invite_code_key" ON "matches"("invite_code");

ALTER TABLE "match_actions"
ADD COLUMN "player_id" UUID,
ADD COLUMN "request_id" TEXT,
ADD COLUMN "response" JSONB,
ADD COLUMN "timeout_streak" INTEGER;

CREATE UNIQUE INDEX "match_actions_match_id_player_id_request_id_key"
ON "match_actions"("match_id", "player_id", "request_id");
