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
});
