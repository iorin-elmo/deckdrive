import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaRewardLedger } from './prisma-reward-ledger.js';

describe('PrismaRewardLedger', () => {
  it('uses the idempotency unique key for an atomic upsert', async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: 'entry',
      playerId: 'player',
      currency: 'GEM',
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
      createdAt: new Date(0),
    });
    const ledger = new PrismaRewardLedger({
      currencyTransaction: { upsert },
    } as unknown as PrismaClient);

    await ledger.insert({
      playerId: 'player',
      currency: 'GEM',
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        playerId_idempotencyKey: { playerId: 'player', idempotencyKey: 'match:1:reward' },
      },
      update: {},
      create: {
        playerId: 'player',
        currency: 'GEM',
        amount: 10,
        reason: 'CPU_MATCH_WIN',
        idempotencyKey: 'match:1:reward',
      },
    });
  });
});
