import { describe, expect, it, vi } from 'vitest';

import { createInitialBattleState, recordReplay } from '@deck-drive/game-engine';
import type { MatchId, PlayerId, Replay } from '@deck-drive/game-engine';
import type { PrismaClient } from '../generated/prisma/client.js';
import { MatchReplayRepository, ReplayPersistenceError } from './replay-repository.js';

describe('MatchReplayRepository', () => {
  it('rejects saving a replay when its card-data version is unavailable', async () => {
    const replay = createZeroActionReplay();
    const cardVersionCount = vi.fn().mockResolvedValue(0);
    const createMatch = vi.fn();
    const transaction = {
      cardVersion: { count: cardVersionCount },
      match: { create: createMatch },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).save(replay)).rejects.toThrow(
      ReplayPersistenceError,
    );
    expect(cardVersionCount).toHaveBeenCalledWith({
      where: { version: replay.cardDataVersion },
    });
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
