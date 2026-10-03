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
    expect(lines.map((line) => JSON.parse(line).path)).toEqual([
      '/api/v1/matches/private/:inviteCode/join',
      '/api/v1/matches/private/:inviteCode/status',
    ]);
  });
});
