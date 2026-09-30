CREATE TYPE "MatchActionSource" AS ENUM ('CLIENT', 'TIMEOUT');

ALTER TABLE "match_actions"
ADD COLUMN "source" "MatchActionSource" NOT NULL DEFAULT 'CLIENT';
