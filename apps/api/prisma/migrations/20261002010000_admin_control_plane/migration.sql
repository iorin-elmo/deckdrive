-- Only OAuth-authenticated sessions may acquire administrative authority.
ALTER TABLE "sessions" ADD COLUMN "auth_provider" "OAuthProvider";

CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_user_id" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "target" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "payload_hash" VARCHAR(64) NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_actions_reason_check" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "admin_actions_request_id_check" CHECK (length(btrim("request_id")) > 0)
);

CREATE TABLE "feature_flags" (
    "name" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("name")
);

CREATE UNIQUE INDEX "admin_actions_admin_user_id_request_id_key" ON "admin_actions"("admin_user_id", "request_id");
CREATE INDEX "admin_actions_target_timestamp_idx" ON "admin_actions"("target", "timestamp");
CREATE INDEX "admin_actions_timestamp_idx" ON "admin_actions"("timestamp");

ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "debug_battles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_user_id" UUID NOT NULL,
    "initial_state" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "commands" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "debug_battles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "debug_battles_created_at_idx" ON "debug_battles"("created_at");
ALTER TABLE "debug_battles" ADD CONSTRAINT "debug_battles_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
