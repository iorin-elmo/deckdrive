import { describe, expect, it } from 'vitest';

import { createLogger } from './index.js';

describe('createLogger', () => {
  it('writes structured JSON and discards credentials and arbitrary PII', () => {
    let line = '';
    const logger = createLogger(
      (value) => {
        line = value;
      },
      () => new Date('2026-10-02T00:00:00.000Z'),
    );
    logger.info('match.action', {
      requestId: 'request-1',
      matchId: 'match-1',
      action: 'PLAY_CARD',
      password: 'secret',
      email: 'private@example.test',
      reason: 'private support note',
    } as never);
    expect(JSON.parse(line)).toEqual({
      level: 'info',
      event: 'match.action',
      timestamp: '2026-10-02T00:00:00.000Z',
      requestId: 'request-1',
      matchId: 'match-1',
      action: 'PLAY_CARD',
    });
  });

  it('redacts private-match invite codes from request paths', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info('http.request', {
      path: '/api/v1/matches/private/secret-invite/join',
    });
    logger.error('api.error', {
      path: '/api/v1/matches/private/secret-invite/status',
    });
    logger.info('http.request', { path: '/api/v1/alpha-battles/join/AABBCCDDEEFF' });
    expect(lines.map((line) => JSON.parse(line).path)).toEqual([
      '/api/v1/matches/private/:inviteCode/join',
      '/api/v1/matches/private/:inviteCode/status',
      '/api/v1/alpha-battles/join/:inviteCode',
    ]);
  });

  it('flushes asynchronously buffered file logs when closed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deckdrive-logger-'));
    const nested = join(directory, 'logs');
    const file = join(nested, 'api.log');
    const logger = createLogger(undefined, () => new Date('2026-10-02T00:00:00.000Z'), file);
    try {
      logger.info('http.request', { requestId: 'first' });
      logger.info('ws.action', { requestId: 'second' });
      await logger.close();
      expect(
        readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      ).toEqual([
        expect.objectContaining({ event: 'http.request', requestId: 'first' }),
        expect.objectContaining({ event: 'ws.action', requestId: 'second' }),
      ]);
    } finally {
      await logger.close();
      unlinkSync(file);
      rmdirSync(nested);
      rmdirSync(directory);
    }
  });
});
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
