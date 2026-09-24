-- Pack catalogue is deployment data, not development-seed data.  Keep stable
-- UUIDs so an environment can be seeded afterwards without duplicating rows.
INSERT INTO "cards" ("id") VALUES
  ('pack_scout'), ('pack_vanguard'), ('pack_aegis'), ('pack_starfall'), ('pack_eternal_mend')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "card_versions" ("id", "card_id", "version", "definition") VALUES
  ('d6ecf9d4-1bf2-4b9f-a1de-000000000001', 'pack_scout', '1.0.0', '{"id":"pack_scout","version":"1.0.0","name":"Scout","class":"HUNTER","rarity":"N","cost":1,"type":"ATTACK","description":"Deal 3 damage.","effects":[{"type":"DAMAGE","amount":3,"target":"ENEMY"}],"keywords":[],"artwork":null,"deckLimit":3}'::jsonb),
  ('d6ecf9d4-1bf2-4b9f-a1de-000000000002', 'pack_vanguard', '1.0.0', '{"id":"pack_vanguard","version":"1.0.0","name":"Vanguard","class":"SWORD","rarity":"R","cost":2,"type":"ATTACK","description":"Deal 7 damage.","effects":[{"type":"DAMAGE","amount":7,"target":"ENEMY"}],"keywords":[],"artwork":null,"deckLimit":3}'::jsonb),
  ('d6ecf9d4-1bf2-4b9f-a1de-000000000003', 'pack_aegis', '1.0.0', '{"id":"pack_aegis","version":"1.0.0","name":"Aegis","class":"GUARDIAN","rarity":"SR","cost":2,"type":"SKILL","description":"Gain 11 block.","effects":[{"type":"GAIN_BLOCK","amount":11,"target":"SELF"}],"keywords":["block"],"artwork":null,"deckLimit":3}'::jsonb),
  ('d6ecf9d4-1bf2-4b9f-a1de-000000000004', 'pack_starfall', '1.0.0', '{"id":"pack_starfall","version":"1.0.0","name":"Starfall","class":"MAGE","rarity":"SSR","cost":3,"type":"ATTACK","description":"Deal 12 damage.","effects":[{"type":"DAMAGE","amount":12,"target":"ENEMY"}],"keywords":[],"artwork":null,"deckLimit":3}'::jsonb),
  ('d6ecf9d4-1bf2-4b9f-a1de-000000000005', 'pack_eternal_mend', '1.0.0', '{"id":"pack_eternal_mend","version":"1.0.0","name":"Eternal Mend","class":"ALCHEMIST","rarity":"UR","cost":3,"type":"SKILL","description":"Restore 10 health.","effects":[{"type":"HEAL","amount":10,"target":"SELF"}],"keywords":["heal"],"artwork":null,"deckLimit":3}'::jsonb)
ON CONFLICT ("card_id", "version") DO NOTHING;
