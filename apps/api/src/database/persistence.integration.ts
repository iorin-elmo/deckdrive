import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvironment } from './load-environment.js';

loadRootEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for database integration tests.');

const client = new Client({ connectionString: databaseUrl });

describe('Phase 3 PostgreSQL persistence', () => {
  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('applies the migration and persists a valid development replay fixture', async () => {
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    expect(tables.rows.map((row) => row.tablename)).toEqual(
      expect.arrayContaining([
        'card_versions',
        'match_actions',
        'match_events',
        'match_snapshots',
        'matches',
      ]),
    );

    const match = await client.query<{
      format_version: number;
      snapshot_interval: number;
      initial_state: unknown;
      final_state: unknown;
      checksum: string;
    }>(
      `SELECT format_version, snapshot_interval, initial_state, final_state, checksum
       FROM matches WHERE id = 'development-seed-replay'`,
    );
    expect(match.rows).toHaveLength(1);
    expect(match.rows[0]).toMatchObject({
      format_version: 1,
      snapshot_interval: 1,
      checksum: 'fnv1a-32:7d5974d2',
    });
    expect(match.rows[0]?.initial_state).toEqual(match.rows[0]?.final_state);
  });

  it('rejects a match player outside the two-seat domain', async () => {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO users (id, email, "displayName", updated_at)
         VALUES ('00000000-0000-0000-0000-000000000003', 'seat-test@deckdrive.local', 'Seat test', NOW())`,
      );
      await client.query(
        `INSERT INTO players (id, user_id, updated_at)
         VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', NOW())`,
      );
      await expect(
        client.query(
          `INSERT INTO match_players (id, match_id, player_id, seat, deck_snapshot)
           VALUES ('00000000-0000-0000-0000-000000000005', 'development-seed-replay',
                   '00000000-0000-0000-0000-000000000004', 3, '{}')`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
