import { describe, expect, it } from 'vitest';

import { AdminInputError, parseAdminCommand } from './contracts.js';

const playerId = '00000000-0000-0000-0000-000000000001';

describe('parseAdminCommand', () => {
  it('requires a reason and a stable request ID for grants', () => {
    expect(() =>
      parseAdminCommand({
        action: 'GRANT_CURRENCY',
        playerId,
        currency: 'GEM',
        amount: 100,
        reason: '',
        requestId: 'retry-1',
      }),
    ).toThrow(AdminInputError);
    expect(() =>
      parseAdminCommand({
        action: 'GRANT_CURRENCY',
        playerId,
        currency: 'GEM',
        amount: 100,
        reason: 'Support grant',
        requestId: '',
      }),
    ).toThrow(AdminInputError);
  });

  it('rejects unknown and unbounded feature flags', () => {
    expect(() =>
      parseAdminCommand({
        action: 'SET_FLAG',
        name: 'ANYTHING',
        enabled: true,
        reason: 'Maintenance',
        requestId: 'flag-1',
      }),
    ).toThrow(AdminInputError);
  });

  it('parses a bounded currency grant', () => {
    expect(
      parseAdminCommand({
        action: 'GRANT_CURRENCY',
        playerId,
        currency: 'GEM',
        amount: 100,
        reason: 'Support grant',
        requestId: 'retry-1',
      }),
    ).toEqual({
      action: 'GRANT_CURRENCY',
      playerId,
      currency: 'GEM',
      amount: 100,
      reason: 'Support grant',
      requestId: 'retry-1',
    });
  });
});
