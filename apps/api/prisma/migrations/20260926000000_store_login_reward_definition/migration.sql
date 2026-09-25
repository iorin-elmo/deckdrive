-- A claimed definition is immutable: retries replay its original type even if the
-- live seven-day catalog changes from a currency reward to a pack or cosmetic.
ALTER TABLE "login_reward_claims"
  ADD COLUMN "reward" JSONB NOT NULL DEFAULT '{"kind":"LEGACY"}'::jsonb;

ALTER TABLE "login_reward_claims"
  ALTER COLUMN "reward" DROP DEFAULT;
