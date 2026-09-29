ALTER TABLE "matches"
  ADD COLUMN "battle_protocol_version" INTEGER,
  ADD COLUMN "draft_definition_revision" TEXT;

ALTER TABLE "match_snapshots"
  ALTER COLUMN "action_index" DROP NOT NULL,
  ADD COLUMN "input_sequence" INTEGER;

ALTER TABLE "match_snapshots"
  ADD CONSTRAINT "match_snapshots_exactly_one_boundary_check"
  CHECK (("action_index" IS NULL) <> ("input_sequence" IS NULL));

CREATE UNIQUE INDEX "match_snapshots_match_id_input_sequence_key"
  ON "match_snapshots"("match_id", "input_sequence");

CREATE TABLE "match_server_commands" (
  "id" UUID NOT NULL,
  "match_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "command" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_server_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_server_commands_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "match_server_commands_match_id_sequence_key"
  ON "match_server_commands"("match_id", "sequence");

CREATE INDEX "match_server_commands_match_id_created_at_idx"
  ON "match_server_commands"("match_id", "created_at");

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_replay_version_fields_check"
  CHECK (
    ("format_version" = 1 AND "battle_protocol_version" IS NULL AND "draft_definition_revision" IS NULL)
    OR
    ("format_version" = 2 AND "battle_protocol_version" = 2 AND "draft_definition_revision" IS NOT NULL)
  );
