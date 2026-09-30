import { describe, expect, it } from 'vitest';

import { loginRewardSchedule } from './catalog.js';

describe('loginRewardSchedule', () => {
  it('implements the specified seven-day sequence and reward types', () => {
    expect(loginRewardSchedule.map(({ reward }) => reward.kind)).toEqual([
      'CURRENCY',
      'CURRENCY',
      'PACK',
      'CURRENCY',
      'COSMETIC',
      'PACK',
      'PACK',
    ]);
    expect(loginRewardSchedule[1]?.reward).toMatchObject({
      kind: 'CURRENCY',
      currency: 'EXCHANGE_POINT',
    });
    expect(loginRewardSchedule[6]?.reward).toMatchObject({
      kind: 'PACK',
      productId: 'RARE_PACK',
    });
  });
});
