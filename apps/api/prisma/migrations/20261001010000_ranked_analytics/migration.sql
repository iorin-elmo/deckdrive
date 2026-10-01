CREATE TYPE "AbuseReviewStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONFIRMED');

ALTER TABLE "match_players" ADD COLUMN "disconnect_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_disconnect_count_check" CHECK ("disconnect_count" >= 0);

ALTER TABLE "rating_abuse_flags" ADD COLUMN "status" "AbuseReviewStatus" NOT NULL DEFAULT 'OPEN';

CREATE TABLE "rating_abuse_reviews" (
    "id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "operator_id" TEXT NOT NULL,
    "previous_status" "AbuseReviewStatus" NOT NULL,
    "next_status" "AbuseReviewStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rating_abuse_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rating_abuse_reviews_flag_id_created_at_idx" ON "rating_abuse_reviews"("flag_id", "created_at");
ALTER TABLE "rating_abuse_reviews" ADD CONSTRAINT "rating_abuse_reviews_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "rating_abuse_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
