CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'DISCORD', 'X');

ALTER TABLE "users"
  ALTER COLUMN "email" DROP NOT NULL;

CREATE TABLE "oauth_accounts" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "OAuthProvider" NOT NULL,
  "provider_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key"
  ON "oauth_accounts"("provider", "provider_user_id");
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key"
  ON "oauth_accounts"("user_id", "provider");
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "csrf_token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE TABLE "oauth_authorizations" (
  "id" UUID NOT NULL,
  "provider" "OAuthProvider" NOT NULL,
  "state_hash" TEXT NOT NULL,
  "code_verifier_hash" TEXT NOT NULL,
  "link_user_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_authorizations_link_user_id_fkey" FOREIGN KEY ("link_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "oauth_authorizations_state_hash_key" ON "oauth_authorizations"("state_hash");
CREATE INDEX "oauth_authorizations_expires_at_idx" ON "oauth_authorizations"("expires_at");
