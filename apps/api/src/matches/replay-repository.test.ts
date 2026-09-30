import { describe, expect, it, vi } from 'vitest';

import { createInitialBattleState, recordReplay } from '@deck-drive/game-engine';
import type { CardInstanceId, MatchId, PlayerId, Replay } from '@deck-drive/game-engine';
import type { PrismaClient } from '../generated/prisma/client.js';
import { MatchReplayRepository, ReplayPersistenceError } from './replay-repository.js';

describe('MatchReplayRepository', () => {
  it('rejects saving a replay when its card-data version is unavailable', async () => {
    const replay = createZeroActionReplay();
    const findCardVersions = vi.fn().mockResolvedValue([]);
    const createMatch = vi.fn();
    const transaction = {
      cardVersion: { findMany: findCardVersions },
      match: { create: createMatch },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).save(replay)).rejects.toThrow(
      ReplayPersistenceError,
    );
    expect(findCardVersions).toHaveBeenCalledWith({
      where: { version: replay.cardDataVersion },
      orderBy: { cardId: 'asc' },
      select: { definition: true },
    });
    expect(createMatch).not.toHaveBeenCalled();
  });

  it('rejects a replay that only matches caller-supplied card definitions', async () => {
    const replay = createActionReplay();
    const createMatch = vi.fn();
    const transaction = {
      cardVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            definition: {
              id: 'guard',
              cost: 1,
              effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }],
            },
          },
        ]),
      },
      match: { create: createMatch },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).save(replay)).rejects.toThrow(
      ReplayPersistenceError,
    );
    expect(createMatch).not.toHaveBeenCalled();
  });

  it('rejects malformed stored definitions even when a replay has no actions', async () => {
    const replay = createZeroActionReplay();
    const createMatch = vi.fn();
    const transaction = {
      cardVersion: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ definition: { id: 'invalid', cost: -1, effects: [] } }]),
      },
      match: { create: createMatch },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).save(replay)).rejects.toThrow(
      ReplayPersistenceError,
    );
    expect(createMatch).not.toHaveBeenCalled();
  });

  it('rejects a zero-action replay when its card-data version is unavailable', async () => {
    const replay = createZeroActionReplay();
    const findCardVersions = vi.fn().mockResolvedValue([]);
    const prisma = {
      match: {
        findUnique: vi.fn().mockResolvedValue({
          id: replay.matchId,
          formatVersion: replay.formatVersion,
          finalState: replay.finalState,
          checksum: replay.checksum,
          cardDataVersion: replay.cardDataVersion,
          actions: [],
          events: [],
          snapshots: [],
        }),
      },
      cardVersion: { findMany: findCardVersions },
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).load(replay.matchId)).rejects.toThrow(
      ReplayPersistenceError,
    );
    expect(findCardVersions).toHaveBeenCalledWith({
      where: { version: replay.cardDataVersion },
      orderBy: { cardId: 'asc' },
      select: { definition: true },
    });
  });
});

function createZeroActionReplay(): Replay {
  const result = recordReplay(
    createInitialBattleState({
      matchId: 'missing-card-version' as MatchId,
      seed: 'seed',
      engineVersion: 'engine',
      rulesVersion: 'rules',
      cardDataVersion: 'missing-card-version',
      initialDrawCount: 0,
      turnDrawCount: 0,
      players: [
        { id: 'player-one' as PlayerId, drawPile: [] },
        { id: 'player-two' as PlayerId, drawPile: [] },
      ],
    }),
    [],
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

function createActionReplay(): Replay {
  const result = recordReplay(
    createInitialBattleState({
      matchId: 'stored-definition-mismatch' as MatchId,
      seed: 'seed',
      engineVersion: 'engine',
      rulesVersion: 'rules',
      cardDataVersion: 'stored-version',
      initialDrawCount: 1,
      turnDrawCount: 0,
      players: [
        {
          id: 'player-one' as PlayerId,
          drawPile: [{ id: 'strike-card' as CardInstanceId, definitionId: 'strike' }],
        },
        { id: 'player-two' as PlayerId, drawPile: [] },
      ],
    }),
    [
      {
        type: 'PLAY_CARD',
        playerId: 'player-one' as PlayerId,
        cardInstanceId: 'strike-card' as CardInstanceId,
        targetId: 'player-two' as PlayerId,
      },
    ],
    [{ id: 'strike', cost: 1, effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }] }],
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}
