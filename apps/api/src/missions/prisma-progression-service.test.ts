import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PrismaProgressionService } from './prisma-progression-service.js';

describe('PrismaProgressionService', () => {
  it('records an idempotent experience grant before updating the player level', async () => {
    const update = vi.fn().mockResolvedValue({ experience: 210, level: 2 });
    const transaction = {
      experienceTransaction: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      player: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ experience: 190, level: 1 }),
        update,
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaProgressionService(prisma).grantExperience({
        playerId: 'player-1',
        amount: 20,
        reason: 'MATCH_COMPLETE',
        idempotencyKey: 'match:1:xp',
      }),
    ).resolves.toEqual({ experience: 210, level: 2 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { experience: 210, level: 2 } }),
    );
  });

  it('does not add experience twice when the same grant is retried', async () => {
    const update = vi.fn();
    const transaction = {
      experienceTransaction: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ amount: 20, reason: 'MATCH_COMPLETE' }),
      },
      player: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ experience: 210, level: 2 }),
        update,
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaProgressionService(prisma).grantExperience({
        playerId: 'player-1',
        amount: 20,
        reason: 'MATCH_COMPLETE',
        idempotencyKey: 'match:1:xp',
      }),
    ).resolves.toEqual({ experience: 210, level: 2 });
    expect(update).not.toHaveBeenCalled();
  });
});
