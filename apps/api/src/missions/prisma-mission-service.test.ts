import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { MissionNotReadyError, PrismaMissionService } from './prisma-mission-service.js';

describe('PrismaMissionService', () => {
  it('claims a completed mission and grants its reward in the same transaction', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({ id: 'reward-1', amount: 20 });
    const transaction = {
      mission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'daily.cpu-battle',
          cadence: 'DAILY',
          target: 1,
          rewardCurrency: 'GEM',
          rewardAmount: 20,
        }),
      },
      playerMission: { updateMany },
      currencyTransaction: { upsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    const result = await new PrismaMissionService(prisma).claim(
      'player-1',
      'daily.cpu-battle',
      new Date('2026-09-25T10:00:00.000Z'),
    );

    expect(result).toMatchObject({ missionId: 'daily.cpu-battle', reward: { amount: 20 } });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodStart: new Date('2026-09-25T00:00:00.000Z'),
          progress: { gte: 1 },
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey: 'mission:daily.cpu-battle:2026-09-25T00:00:00.000Z',
        }),
      }),
    );
  });

  it('does not grant a reward when the mission is incomplete or already claimed', async () => {
    const upsert = vi.fn();
    const transaction = {
      mission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'daily.cpu-battle',
          cadence: 'DAILY',
          target: 1,
          rewardCurrency: 'GEM',
          rewardAmount: 20,
        }),
      },
      playerMission: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      currencyTransaction: { upsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaMissionService(prisma).claim('player-1', 'daily.cpu-battle'),
    ).rejects.toBeInstanceOf(MissionNotReadyError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('makes a second login claim on the same UTC day a no-op', async () => {
    const create = vi.fn();
    const transaction = {
      loginRewardClaim: {
        findUnique: vi.fn().mockResolvedValue({ id: 'claim-1', cycleDay: 4 }),
      },
      currencyTransaction: { upsert: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    const result = await new PrismaMissionService(prisma).claimLoginReward(
      'player-1',
      new Date('2026-09-25T23:59:59.000Z'),
    );

    expect(result).toMatchObject({ alreadyClaimed: true, claim: { id: 'claim-1' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('uses an atomic upsert for a concurrent first login claim', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'claim-1', cycleDay: 1 });
    const transaction = {
      loginRewardClaim: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert,
      },
      currencyTransaction: { upsert: vi.fn().mockResolvedValue({ id: 'reward-1' }) },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await new PrismaMissionService(prisma).claimLoginReward(
      'player-1',
      new Date('2026-09-25T10:00:00.000Z'),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          playerId_day: { playerId: 'player-1', day: new Date('2026-09-25T00:00:00.000Z') },
        },
      }),
    );
  });
});
