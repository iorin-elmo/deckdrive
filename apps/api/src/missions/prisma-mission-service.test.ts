import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { RewardValidationError } from '../rewards/reward-ledger.js';
import { MissionNotReadyError, PrismaMissionService } from './prisma-mission-service.js';

describe('PrismaMissionService', () => {
  it('claims a completed mission and grants its reward in the same transaction', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const lockPlayer = vi.fn();
    const upsert = vi.fn().mockResolvedValue({
      id: 'reward-1',
      currency: 'GEM',
      amount: 20,
      reason: 'MISSION:daily.cpu-battle',
    });
    const transaction = {
      $queryRaw: lockPlayer,
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
    expect(lockPlayer.mock.invocationCallOrder[0]).toBeLessThan(
      updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('does not grant a reward when the mission is incomplete or already claimed', async () => {
    const upsert = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      mission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'daily.cpu-battle',
          cadence: 'DAILY',
          target: 1,
          rewardCurrency: 'GEM',
          rewardAmount: 20,
        }),
      },
      playerMission: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
      },
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

  it('replays a completed mission claim with its original reward', async () => {
    const claimedAt = new Date('2026-09-25T10:00:00.000Z');
    const currencyUpsert = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      mission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'daily.cpu-battle',
          cadence: 'DAILY',
          target: 1,
          rewardCurrency: 'GEM',
          rewardAmount: 20,
        }),
      },
      playerMission: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ claimedAt }),
      },
      currencyTransaction: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currency: 'GEM', amount: 20, reason: 'MISSION:daily.cpu-battle' }),
        upsert: currencyUpsert,
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaMissionService(prisma).claim(
        'player-1',
        'daily.cpu-battle',
        new Date('2026-09-25T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ missionId: 'daily.cpu-battle', claimedAt, reward: { amount: 20 } });
    expect(currencyUpsert).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key that belongs to a different mission reward', async () => {
    const transaction = {
      $queryRaw: vi.fn(),
      mission: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'daily.cpu-battle',
          cadence: 'DAILY',
          target: 1,
          rewardCurrency: 'GEM',
          rewardAmount: 20,
        }),
      },
      playerMission: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      currencyTransaction: {
        upsert: vi
          .fn()
          .mockResolvedValue({ currency: 'EXCHANGE_POINT', amount: 20, reason: 'MISSION:other' }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaMissionService(prisma).claim(
        'player-1',
        'daily.cpu-battle',
        new Date('2026-09-25T10:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(RewardValidationError);
  });

  it('makes a second login claim on the same UTC day a no-op', async () => {
    const create = vi.fn();
    const lockPlayer = vi.fn();
    const transaction = {
      $queryRaw: lockPlayer,
      loginRewardClaim: {
        findUnique: vi.fn().mockResolvedValue({ id: 'claim-1', cycleDay: 4 }),
      },
      currencyTransaction: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ currency: 'GEM', amount: 35, reason: 'LOGIN_DAY:4' }),
        upsert: vi.fn(),
      },
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
    expect(lockPlayer).toHaveBeenCalledOnce();
  });

  it('uses an atomic upsert for a concurrent first login claim', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'claim-1', cycleDay: 1 });
    const transaction = {
      $queryRaw: vi.fn(),
      loginRewardClaim: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        upsert,
      },
      currencyTransaction: {
        upsert: vi.fn().mockResolvedValue({
          id: 'reward-1',
          currency: 'GEM',
          amount: 20,
          reason: 'LOGIN_DAY:1',
        }),
      },
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

  it('creates first-time mission progress and uses an atomic increment for later events', async () => {
    const upsert = vi.fn().mockResolvedValue({ progress: 1 });
    const lockPlayer = vi.fn();
    const transaction = {
      $queryRaw: lockPlayer,
      mission: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'daily.cpu-battle', cadence: 'DAILY', target: 3 }]),
      },
      playerMission: { findUnique: vi.fn().mockResolvedValue(null), upsert, update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await new PrismaMissionService(prisma).recordProgress(
      'player-1',
      'CPU_BATTLE',
      1,
      new Date('2026-09-25T10:00:00.000Z'),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { progress: { increment: 1 } },
        create: expect.objectContaining({ progress: 1 }),
      }),
    );
    expect(lockPlayer.mock.invocationCallOrder[0]).toBeLessThan(
      upsert.mock.invocationCallOrder[0]!,
    );
  });

  it('grants the day-five cosmetic from the authoritative login reward flow', async () => {
    const cosmeticUpsert = vi.fn().mockResolvedValue({ cosmeticId: 'frame.aurora' });
    const transaction = {
      $queryRaw: vi.fn(),
      loginRewardClaim: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({
          day: new Date('2026-09-24T00:00:00.000Z'),
          cycleDay: 4,
        }),
        upsert: vi.fn().mockResolvedValue({ id: 'claim-5', cycleDay: 5 }),
      },
      currencyTransaction: {
        upsert: vi.fn().mockResolvedValue({ currency: 'GEM', amount: 40, reason: 'LOGIN_DAY:5' }),
      },
      cosmetic: { findUnique: vi.fn().mockResolvedValue({ id: 'frame.aurora' }) },
      cosmeticGrant: {
        upsert: vi.fn().mockResolvedValue({ cosmeticId: 'frame.aurora', source: 'LOGIN_DAY:5' }),
      },
      playerCosmetic: { findUnique: vi.fn().mockResolvedValue(null), upsert: cosmeticUpsert },
    };
    const prisma = {
      $transaction: vi.fn((operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await new PrismaMissionService(prisma).claimLoginReward(
      'player-1',
      new Date('2026-09-25T10:00:00.000Z'),
    );

    expect(cosmeticUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cosmeticId: 'frame.aurora',
          source: 'LOGIN_DAY:5',
        }),
      }),
    );
  });
});
