-- Existing ownership rows predate idempotent cosmetic grants. Give each one a stable,
-- unique legacy key before making the grant key mandatory for Prisma and the database.
UPDATE "player_cosmetics"
SET "idempotency_key" = 'legacy:' || "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "player_cosmetics"
  ALTER COLUMN "idempotency_key" SET NOT NULL;
