import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaCosmeticService } from './prisma-cosmetic-service.js';

describe('PrismaCosmeticService', () => {
  it('grants an existing cosmetic with an idempotency key and no game-state dependency', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'ownership-1', cosmeticId: 'frame.aurora' });
    const grantUpsert = vi
      .fn()
      .mockResolvedValue({ cosmeticId: 'frame.aurora', source: 'LOGIN_DAY:5' });
    const transaction = {
      cosmetic: { findUnique: vi.fn().mockResolvedValue({ id: 'frame.aurora' }) },
      cosmeticGrant: { upsert: grantUpsert },
      playerCosmetic: { upsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaCosmeticService(prisma).grant({
        playerId: 'player-1',
        cosmeticId: 'frame.aurora',
        source: 'LOGIN_DAY:5',
        idempotencyKey: 'login:2026-09-25:cosmetic',
      }),
    ).resolves.toMatchObject({ cosmeticId: 'frame.aurora' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: 'LOGIN_DAY:5' }),
      }),
    );
    expect(grantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ idempotencyKey: 'login:2026-09-25:cosmetic' }),
      }),
    );
  });

  it('records a later grant for an already-owned cosmetic under its own idempotency key', async () => {
    const grantUpsert = vi.fn().mockResolvedValue({ cosmeticId: 'frame.aurora', source: 'EVENT' });
    const ownershipUpsert = vi
      .fn()
      .mockResolvedValue({ id: 'ownership-1', cosmeticId: 'frame.aurora' });
    const transaction = {
      cosmetic: { findUnique: vi.fn().mockResolvedValue({ id: 'frame.aurora' }) },
      cosmeticGrant: { upsert: grantUpsert },
      playerCosmetic: { upsert: ownershipUpsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await new PrismaCosmeticService(prisma).grant({
      playerId: 'player-1',
      cosmeticId: 'frame.aurora',
      source: 'EVENT',
      idempotencyKey: 'event:42:cosmetic',
    });

    expect(grantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          playerId_idempotencyKey: {
            playerId: 'player-1',
            idempotencyKey: 'event:42:cosmetic',
          },
        },
      }),
    );
    expect(ownershipUpsert).toHaveBeenCalledOnce();
  });

  it('rejects an idempotency key recorded for a different cosmetic grant', async () => {
    const ownershipUpsert = vi.fn();
    const transaction = {
      cosmetic: { findUnique: vi.fn().mockResolvedValue({ id: 'frame.aurora' }) },
      cosmeticGrant: {
        upsert: vi.fn().mockResolvedValue({ cosmeticId: 'frame.aurora', source: 'OTHER_EVENT' }),
      },
      playerCosmetic: { upsert: ownershipUpsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaCosmeticService(prisma).grant({
        playerId: 'player-1',
        cosmeticId: 'frame.aurora',
        source: 'EVENT',
        idempotencyKey: 'event:42:cosmetic',
      }),
    ).rejects.toThrow('Idempotency key was already used for a different cosmetic grant.');
    expect(ownershipUpsert).not.toHaveBeenCalled();
  });
});
