-- Catalog rows are deployment data, not development seed data. Keep these values aligned with
-- apps/api/src/missions/catalog.ts and apps/api/src/cosmetics/catalog.ts.
INSERT INTO "missions" ("id", "cadence", "metric", "target", "reward_currency", "reward_amount", "active", "created_at", "updated_at")
VALUES
  ('daily.cpu-battle', 'DAILY', 'CPU_BATTLE', 1, 'GEM', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('daily.pvp-battle', 'DAILY', 'PVP_BATTLE', 1, 'GEM', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('daily.card-play', 'DAILY', 'CARD_PLAY', 10, 'GEM', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('daily.damage', 'DAILY', 'DAMAGE', 40, 'GEM', 25, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('daily.block', 'DAILY', 'BLOCK', 20, 'GEM', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('daily.win', 'DAILY', 'WIN', 1, 'GEM', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('weekly.ranked-battle', 'WEEKLY', 'RANKED_BATTLE', 5, 'GEM', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('weekly.class-usage', 'WEEKLY', 'CLASS_USAGE', 3, 'EXCHANGE_POINT', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('weekly.deck-objective', 'WEEKLY', 'DECK_OBJECTIVE', 3, 'GEM', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "cadence" = EXCLUDED."cadence", "metric" = EXCLUDED."metric", "target" = EXCLUDED."target",
  "reward_currency" = EXCLUDED."reward_currency", "reward_amount" = EXCLUDED."reward_amount",
  "active" = EXCLUDED."active", "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "cosmetics" ("id", "kind", "name", "description", "created_at")
VALUES
  ('frame.aurora', 'CARD_FRAME', 'Aurora Frame', 'A cool cyan card frame.', CURRENT_TIMESTAMP),
  ('art.starlight', 'CARD_FULL_ART_FX', 'Starlight', 'A subtle full-art starlight effect.', CURRENT_TIMESTAMP),
  ('animation.comet', 'CARD_ANIMATION', 'Comet', 'A card entrance animation.', CURRENT_TIMESTAMP),
  ('hologram.prism', 'HOLOGRAM', 'Prism', 'A holographic card finish.', CURRENT_TIMESTAMP),
  ('leader.vanguard', 'LEADER_SKIN', 'Vanguard', 'A leader portrait skin.', CURRENT_TIMESTAMP),
  ('playmat.observatory', 'PLAYMAT', 'Observatory', 'A night-sky playmat.', CURRENT_TIMESTAMP),
  ('sleeve.circuit', 'CARD_SLEEVE', 'Circuit', 'A circuit-pattern card sleeve.', CURRENT_TIMESTAMP),
  ('title.pathfinder', 'TITLE', 'Pathfinder', 'A profile title.', CURRENT_TIMESTAMP),
  ('profile.signal', 'PROFILE_DECORATION', 'Signal', 'A profile decoration.', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "kind" = EXCLUDED."kind", "name" = EXCLUDED."name", "description" = EXCLUDED."description";
