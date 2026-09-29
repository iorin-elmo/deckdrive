import { describe, expect, it, vi } from 'vitest';

import {
  calculateDraftDefinitionRevision,
  createInitialBattleState,
  createInitialBattleStateV2,
  recordReplay,
  recordReplayV2,
} from '@deck-drive/game-engine';
import type {
  BattleInput,
  CardDefinitionV2,
  CardInstanceId,
  CardInstanceV2,
  MatchId,
  PlayerId,
  Replay,
} from '@deck-drive/game-engine';
import type { PrismaClient } from '../generated/prisma/client.js';
import { MatchReplayRepository, ReplayPersistenceError } from './replay-repository.js';

describe('MatchReplayRepository', () => {
  it('saves legacy definitions without embedded versions', async () => {
    const replay = createActionReplay();
    const createMatch = vi.fn();
    const transaction = {
      cardVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            definition: {
              id: 'strike',
              cost: 1,
              effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }],
            },
          },
        ]),
      },
      match: { create: createMatch },
      matchAction: { create: vi.fn() },
      matchEvent: { create: vi.fn() },
      matchSnapshot: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await new MatchReplayRepository(prisma).save(replay);
    expect(createMatch).toHaveBeenCalledWith({
      data: expect.objectContaining({ formatVersion: 1, id: replay.matchId }),
    });
  });

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

  it('persists Replay V2 actions, server commands, metadata, and input snapshots', async () => {
    const definitions: readonly CardDefinitionV2[] = [
      {
        id: 'search',
        version: '1.0.0',
        cost: 0,
        effects: [{ type: 'REQUEST_CARD_CHOICE', from: 'DRAW_PILE', maximumCost: 1 }],
        keywords: [],
        deckLimit: 3,
      },
      {
        id: 'candidate',
        version: '1.0.0',
        cost: 1,
        effects: [{ type: 'GAIN_BLOCK', amount: 1, target: 'SELF' }],
        keywords: [],
        deckLimit: 3,
      },
    ];
    const firstPlayer = 'v2-player-one' as PlayerId;
    const searchCard: CardInstanceV2 = {
      id: 'search-card' as CardInstanceId,
      definitionId: 'search',
      definitionVersion: '1.0.0',
      costModifier: 0,
      visibility: 'ownerOnly',
    };
    const candidateCard: CardInstanceV2 = {
      id: 'candidate-card' as CardInstanceId,
      definitionId: 'candidate',
      definitionVersion: '1.0.0',
      costModifier: 0,
      visibility: 'ownerOnly',
    };
    const initialState = createInitialBattleStateV2({
      matchId: 'persist-v2' as MatchId,
      engineVersion: '2.0.0',
      rulesVersion: '2.0.0',
      cardDataVersion: '1.0.0',
      seed: 'persist-v2',
      initialDrawCount: 1,
      turnDrawCount: 1,
      players: [
        { id: firstPlayer, drawPile: [searchCard, candidateCard] },
        { id: 'v2-player-two' as PlayerId, drawPile: [] },
      ],
    });
    const inputs: readonly BattleInput[] = [
      {
        inputSequence: 1,
        kind: 'CLIENT_ACTION',
        payload: {
          type: 'PLAY_CARD',
          playerId: firstPlayer,
          cardInstanceId: searchCard.id,
        },
      },
      {
        inputSequence: 2,
        kind: 'SERVER_COMMAND',
        payload: {
          type: 'CARD_CHOICE_DEADLINE_ISSUED',
          playerId: firstPlayer,
          choiceRequestId: 'choice:1',
          issuedAt: 1_790_640_000_000,
          deadlineAt: 1_790_640_060_000,
          timeoutAuthorization: 'signed',
        },
      },
      {
        inputSequence: 3,
        kind: 'CLIENT_ACTION',
        payload: {
          type: 'SUBMIT_CARD_CHOICE',
          playerId: firstPlayer,
          choiceRequestId: 'choice:1',
          choice: { kind: 'CARD', cardInstanceId: candidateCard.id },
        },
      },
    ];
    const revision = calculateDraftDefinitionRevision(definitions);
    const recorded = recordReplayV2(initialState, inputs, definitions, {
      draftDefinitionRevision: revision,
      battleProtocolVersion: 2,
      authorizeServerCommand: () => true,
    });
    if (!recorded.ok) throw new Error(recorded.error.message);

    const createMatch = vi.fn();
    const createAction = vi.fn();
    const createCommand = vi.fn();
    const createEvent = vi.fn();
    const createSnapshot = vi.fn();
    const upsertDefinitionSnapshot = vi.fn();
    const transaction = {
      cardVersion: {
        findMany: vi.fn().mockResolvedValue(definitions.map((definition) => ({ definition }))),
      },
      match: { create: createMatch },
      matchAction: { create: createAction },
      matchServerCommand: { create: createCommand },
      matchEvent: { create: createEvent },
      matchSnapshot: { create: createSnapshot },
      replayDefinitionSnapshot: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: upsertDefinitionSnapshot,
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    } as unknown as PrismaClient;

    await expect(new MatchReplayRepository(prisma).save(recorded.replay)).rejects.toThrow(
      'server-command verifier is required',
    );
    await new MatchReplayRepository(prisma, () => true).save(recorded.replay);

    expect(createMatch).toHaveBeenCalledWith({
      data: expect.objectContaining({
        formatVersion: 2,
        battleProtocolVersion: 2,
        draftDefinitionRevision: revision,
      }),
    });
    expect(upsertDefinitionSnapshot).toHaveBeenCalledWith({
      where: { revision },
      create: { revision, definitions },
      update: {},
    });
    expect(createAction).toHaveBeenCalledTimes(2);
    expect(createCommand).toHaveBeenCalledWith({
      data: expect.objectContaining({ sequence: 2 }),
    });
    expect(createSnapshot).toHaveBeenCalledWith({
      data: expect.objectContaining({ actionIndex: null, inputSequence: 3 }),
    });

    const findCurrentDefinitions = vi.fn();
    const findDefinitionSnapshot = vi.fn().mockResolvedValue({
      revision,
      definitions,
    });
    const storedReplay = recorded.replay;
    const loadPrisma = {
      match: {
        findUnique: vi.fn().mockResolvedValue({
          id: storedReplay.matchId,
          engineVersion: storedReplay.engineVersion,
          rulesVersion: storedReplay.rulesVersion,
          cardDataVersion: storedReplay.cardDataVersion,
          formatVersion: storedReplay.formatVersion,
          battleProtocolVersion: storedReplay.battleProtocolVersion,
          draftDefinitionRevision: storedReplay.draftDefinitionRevision,
          snapshotInterval: storedReplay.snapshotInterval,
          seed: storedReplay.seed,
          initialState: storedReplay.initialState,
          finalState: storedReplay.finalState,
          checksum: storedReplay.checksum,
          actions: storedReplay.actions.map((action) => ({
            sequence: action.inputSequence,
            action: action.payload,
          })),
          serverCommands: storedReplay.serverCommands.map((command) => ({
            sequence: command.inputSequence,
            command: command.payload,
          })),
          events: storedReplay.events.map((event) => ({ event })),
          snapshots: storedReplay.snapshots.map((snapshot) => ({
            actionIndex: null,
            inputSequence: snapshot.inputSequence,
            eventSequence: snapshot.eventSequence,
            state: snapshot.state,
          })),
        }),
      },
      cardVersion: { findMany: findCurrentDefinitions },
      replayDefinitionSnapshot: { findUnique: findDefinitionSnapshot },
    } as unknown as PrismaClient;
    await expect(
      new MatchReplayRepository(loadPrisma, () => true).load(storedReplay.matchId),
    ).resolves.toEqual(storedReplay);
    expect(findDefinitionSnapshot).toHaveBeenCalledWith({ where: { revision } });
    expect(findCurrentDefinitions).not.toHaveBeenCalled();
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
