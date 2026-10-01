import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migrationPath = new URL(
  '../../prisma/migrations/20260916000000_init/migration.sql',
  import.meta.url,
);
const migration = readFileSync(migrationPath, 'utf8');

describe('initial persistence migration', () => {
  it('creates the versioned replay persistence tables without destructive SQL', () => {
    expect(migration).toContain('CREATE TABLE "card_versions"');
    expect(migration).toContain('CREATE TABLE "matches"');
    expect(migration).toContain('CREATE TABLE "match_actions"');
    expect(migration).toContain('CREATE TABLE "match_events"');
    expect(migration).toContain('CREATE TABLE "match_snapshots"');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS citext;');
    expect(migration).toContain('"format_version" INTEGER NOT NULL DEFAULT 1');
    expect(migration).toContain('"snapshot_interval" INTEGER NOT NULL DEFAULT 1');
    expect(migration).not.toMatch(/\bDROP\b/u);
  });

  it('preserves ordering and collection constraints in the database', () => {
    expect(migration).toContain('match_actions_match_id_sequence_key');
    expect(migration).toContain('match_events_match_id_sequence_key');
    expect(migration).toContain('match_snapshots_match_id_action_index_key');
    expect(migration).toContain('player_cards_quantity_positive');
    expect(migration).toContain('deck_cards_position_non_negative');
    expect(migration).toContain('match_players_seat_between_one_and_two');
    expect(migration).toContain('matches_format_version_positive');
    expect(migration).toContain('matches_snapshot_interval_positive');
    expect(migration).not.toContain('card_versions_card_id_version_idx');
  });
});

describe('Phase 4 currency ledger migration', () => {
  const ledgerMigration = readFileSync(
    new URL(
      '../../prisma/migrations/20260921000000_add_currency_ledger/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('adds an append-only, idempotent currency transaction ledger', () => {
    expect(ledgerMigration).toContain('CREATE TABLE "currency_transactions"');
    expect(ledgerMigration).toContain('currency_transactions_amount_positive');
    expect(ledgerMigration).toContain('CHECK ("amount" > 0)');
    expect(ledgerMigration).toContain('currency_transactions_player_id_idempotency_key_key');
    expect(ledgerMigration).toContain('FOREIGN KEY ("player_id") REFERENCES "players"');
    expect(ledgerMigration).not.toMatch(/\bDROP\b/u);
  });
});

describe('Replay V2 migration', () => {
  const replayV2Migration = readFileSync(
    new URL('../../prisma/migrations/20260929000000_add_replay_v2/migration.sql', import.meta.url),
    'utf8',
  );

  it('adds versioned server inputs and keeps legacy action boundaries', () => {
    expect(replayV2Migration).toContain('ADD COLUMN "battle_protocol_version"');
    expect(replayV2Migration).toContain('ADD COLUMN "draft_definition_revision"');
    expect(replayV2Migration).toContain('CREATE TABLE "match_server_commands"');
    expect(replayV2Migration).toContain('ADD COLUMN "input_sequence" INTEGER');
    expect(replayV2Migration).toContain('match_snapshots_exactly_one_boundary_check');
    expect(replayV2Migration).toContain('matches_replay_version_fields_check');
    expect(replayV2Migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/u);
  });
});

describe('Ranked settlement migration', () => {
  const rankedMigration = readFileSync(
    new URL(
      '../../prisma/migrations/20261001000000_add_ranked_settlement/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('adds season, rating snapshot, history, and abuse flag integrity constraints', () => {
    expect(rankedMigration).toContain('CREATE TABLE "seasons"');
    expect(rankedMigration).toContain('CREATE TABLE "player_season_ratings"');
    expect(rankedMigration).toContain('CREATE TABLE "ranked_match_players"');
    expect(rankedMigration).toContain('CREATE TABLE "rating_history"');
    expect(rankedMigration).toContain('CREATE TABLE "rating_abuse_flags"');
    expect(rankedMigration).toContain('seasons_one_active_key');
    expect(rankedMigration).toContain('rating_history_match_id_player_id_key');
    expect(rankedMigration).toContain('rating_history_loss_delta_check');
    expect(rankedMigration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/u);
  });
});
