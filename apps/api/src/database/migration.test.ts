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
    expect(migration).not.toMatch(/\bDROP\b/u);
  });

  it('preserves ordering and collection constraints in the database', () => {
    expect(migration).toContain('match_actions_match_id_sequence_key');
    expect(migration).toContain('match_events_match_id_sequence_key');
    expect(migration).toContain('match_snapshots_match_id_action_index_key');
    expect(migration).toContain('player_cards_quantity_positive');
    expect(migration).toContain('deck_cards_position_non_negative');
  });
});
