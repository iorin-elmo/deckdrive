import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaCosmeticService } from './prisma-cosmetic-service.js';

describe('PrismaCosmeticService', () => {
  it('grants an existing cosmetic with an idempotency key and no game-state dependency', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'ownership-1', cosmeticId: 'frame.aurora' });
    const transaction = {
      cosmetic: { findUnique: vi.fn().mockResolvedValue({ id: 'frame.aurora' }) },
      playerCosmetic: { findUnique: vi.fn().mockResolvedValue(null), upsert },
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
  });
});
