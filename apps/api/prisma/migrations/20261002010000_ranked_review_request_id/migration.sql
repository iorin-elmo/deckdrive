ALTER TABLE "rating_abuse_reviews" ADD COLUMN "request_id" TEXT;

-- Existing audits remain addressable by a stable key without changing their content.
UPDATE "rating_abuse_reviews" SET "request_id" = "id"::text;

ALTER TABLE "rating_abuse_reviews" ALTER COLUMN "request_id" SET NOT NULL;

CREATE UNIQUE INDEX "rating_abuse_reviews_flag_id_request_id_key"
  ON "rating_abuse_reviews"("flag_id", "request_id");
