import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import {
  InsufficientGemError,
  PrismaPackOpeningService,
  type PackOpeningOperations,
} from './prisma-pack-opening.js';
import { PackOpeningValidationError } from './pack-opening.js';

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

  it('rejects a client idempotency key in the reserved server reward namespace', async () => {
    const service = new PrismaPackOpeningService({
      $transaction: vi.fn(),
    } as unknown as PrismaClient);

    await expect(
      service.open({
        playerId: 'player',
        productId: 'NORMAL_PACK',
        idempotencyKey: 'server:login:2026-09-25T00:00:00.000Z:pack',
      }),
    ).rejects.toBeInstanceOf(PackOpeningValidationError);
  });

  it('grants a login pack without charging Gems', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'opening' });
    const currencyCreate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'player' }]),
      packOpening: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
        update: vi.fn(),
      },
      cardVersion: {
        findMany: vi
          .fn()
          .mockResolvedValue(
            pool.map((card) => ({ id: card.id, definition: { rarity: card.rarity } })),
          ),
      },
      playerCard: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
      currencyTransaction: { aggregate: vi.fn(), create: currencyCreate },
    };
    const service = new PrismaPackOpeningService(transactionalClient(transaction));

    const result = await service.grantInTransaction(
      transaction as unknown as PackOpeningOperations,
      {
        playerId: 'player',
        productId: 'NORMAL_PACK',
        idempotencyKey: 'server:login:2026-09-25:pack',
        seed: 'login-pack',
      },
    );

    expect(result).toMatchObject({ productId: 'NORMAL_PACK', gemCost: 0 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gemCost: 0 }) }),
    );
    expect(currencyCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'PACK_OPEN' }) }),
    );
  });
});

function transactionalClient(transaction: object): PrismaClient {
  return {
    $transaction: async (operation: (client: object) => Promise<unknown>) => operation(transaction),
  } as unknown as PrismaClient;
}
