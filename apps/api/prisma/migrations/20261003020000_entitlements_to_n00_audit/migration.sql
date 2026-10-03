-- Preserve historical automatic grants in the N00 administrator audit console.
-- Keep the old table for backwards-compatible rollback of the deployed card pool.
INSERT INTO "admin_actions" (
  "id", "admin_user_id", "request_id", "action", "target", "reason", "payload_hash", "before", "after", "timestamp"
)
SELECT "id", "admin_user_id", 'entitlement:' || "id"::text,
  'ADMIN_CARD_ENTITLEMENT', 'player:' || "player_id"::text || ':card:' || "card_version_id"::text,
  "reason", encode(sha256(convert_to("id"::text, 'UTF8')), 'hex'),
  jsonb_build_object('quantity', "before_quantity"),
  jsonb_build_object('quantity', "after_quantity"), "created_at"
FROM "admin_card_entitlements"
ON CONFLICT ("admin_user_id", "request_id") DO NOTHING;
