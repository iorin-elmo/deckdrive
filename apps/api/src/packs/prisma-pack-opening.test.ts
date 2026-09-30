import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { InsufficientGemError, PrismaPackOpeningService } from './prisma-pack-opening.js';

const pool = [
  { id: 'n', rarity: 'N' },
  { id: 'r', rarity: 'R' },
  { id: 'sr', rarity: 'SR' },
  { id: 'ssr', rarity: 'SSR' },
  { id: 'ur', rarity: 'UR' },
] as const;

describe('PrismaPackOpeningService', () => {
  it('returns the persisted result for an idempotent replay without charging again', async () => {
    const result = {
      openingId: 'opening',
      productId: 'BOX' as const,
      gemCost: 1000,
      cards: [],
      grants: [],
      exchangePoints: 0,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'player' }]),
      packOpening: { findUnique: vi.fn().mockResolvedValue({ product: 'BOX', result }) },
    };
    const service = new PrismaPackOpeningService(transactionalClient(transaction));

    await expect(
      service.open({ playerId: 'player', productId: 'BOX', idempotencyKey: 'repeat' }),
    ).resolves.toEqual(result);
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
  });

  it('fails before mutations when the locked balance is insufficient', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'player' }]),
      packOpening: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn() },
      cardVersion: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            pool.map((card) => ({ id: card.id, definition: { rarity: card.rarity } })),
          ),
      },
      currencyTransaction: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      playerCard: { findMany: vi.fn() },
    };
    const service = new PrismaPackOpeningService(transactionalClient(transaction));

    await expect(
      service.open({
        playerId: 'player',
        productId: 'BOX',
        idempotencyKey: 'no-gems',
        seed: 'seed',
      }),
    ).rejects.toBeInstanceOf(InsufficientGemError);
    expect(transaction.packOpening.count).not.toHaveBeenCalled();
  });
});

function transactionalClient(transaction: object): PrismaClient {
  return {
    $transaction: async (operation: (client: object) => Promise<unknown>) => operation(transaction),
  } as unknown as PrismaClient;
}
