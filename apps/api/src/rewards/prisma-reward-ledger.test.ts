import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { RewardService } from './reward-ledger.js';
import { PrismaRewardLedger, PrismaRewardLedgerOperations } from './prisma-reward-ledger.js';

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
    const ledger = new PrismaRewardLedgerOperations({
      currencyTransaction: { upsert },
    } as unknown as PrismaClient);

    await ledger.findOrInsert({
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

  it('creates an operation-only adapter inside a transaction-aware repository', async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: 'entry',
      playerId: 'player',
      currency: 'GEM',
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
      createdAt: new Date(0),
    });
    const transaction = { currencyTransaction: { upsert } };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await new RewardService(new PrismaRewardLedger(prisma)).grant({
      playerId: 'player',
      currency: 'GEM',
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
  });
});
