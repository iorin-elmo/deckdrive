import { recordReplay } from '@deck-drive/game-engine';
import type { BattleState, GameEvent, PlayerId } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PrismaRankedSettlement } from '../ranked/prisma-ranked-settlement.js';
import type { AcceptedAction } from './session.js';

export class PvpConcurrentMatchError extends Error {
  constructor(matchId: string) {
    super(`PvP match ${matchId} was advanced by another worker.`);
    this.name = 'PvpConcurrentMatchError';
  }
}

type NewMatchPlayers = readonly [
  { readonly playerId: string; readonly deckSnapshot: unknown },
  { readonly playerId: string; readonly deckSnapshot: unknown },
];

type NewMatchMetadata = {
  readonly mode: 'CASUAL' | 'PRIVATE' | 'RANKED';
  readonly queueId?: string;
  readonly inviteCode?: string;
};

/** Persists the accepted engine transition and its replay boundary atomically. */
export class PrismaPvpMatchPersistence {
  private readonly ranked: PrismaRankedSettlement;

  constructor(private readonly prisma: PrismaClient) {
    this.ranked = new PrismaRankedSettlement(prisma);
  }

  async create(
    state: BattleState,
    players: NewMatchPlayers,
    metadata: NewMatchMetadata,
  ): Promise<void> {
    await this.prisma.$transaction((transaction) =>
      this.createInTransaction(transaction, state, players, metadata),
    );
  }

  async createInTransaction(
    transaction: Prisma.TransactionClient,
    state: BattleState,
    players: NewMatchPlayers,
    metadata: NewMatchMetadata,
  ): Promise<void> {
    await transaction.match.create({
      data: {
        id: state.matchId,
        engineVersion: state.engineVersion,
        rulesVersion: state.rulesVersion,
        cardDataVersion: state.cardDataVersion,
        seed: state.seed,
        mode: metadata.mode,
        ...(metadata.queueId === undefined ? {} : { queueId: metadata.queueId }),
        ...(metadata.inviteCode === undefined ? {} : { inviteCode: metadata.inviteCode }),
        initialState: asInputJson(state),
        players: {
          create: players.map((player, index) => ({
            playerId: player.playerId,
            seat: index + 1,
            deckSnapshot: asInputJson(player.deckSnapshot),
            disconnectedAt: new Date(),
          })),
        },
      },
    });
    for (const event of state.events) {
      await transaction.matchEvent.create({
        data: { matchId: state.matchId, sequence: event.sequence, event: asInputJson(event) },
      });
    }
    const snapshotState = withoutEvents(state);
    await transaction.matchSnapshot.create({
      data: {
        matchId: state.matchId,
        actionIndex: 0,
        eventSequence: state.events.at(-1)?.sequence ?? 0,
        state: asInputJson(snapshotState),
      },
    });
    if (metadata.mode === 'RANKED') await this.ranked.captureMatchStart(transaction, state);
  }

  async append(accepted: AcceptedAction): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // A process-local session serializes normal traffic. This row lock also
      // protects the sequence boundary when more than one API worker exists.
      await transaction.$queryRaw`SELECT id FROM matches WHERE id = ${accepted.matchId} FOR UPDATE`;
      const match = await transaction.match.findUnique({
        where: { id: accepted.matchId },
        select: { status: true, mode: true },
      });
      const latestAction = await transaction.matchAction.findFirst({
        where: { matchId: accepted.matchId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      if (
        match?.status !== 'IN_PROGRESS' ||
        (latestAction?.sequence ?? 0) !== accepted.sequence - 1
      )
        throw new PvpConcurrentMatchError(accepted.matchId);
      await transaction.matchAction.create({
        data: {
          matchId: accepted.matchId,
          sequence: accepted.sequence,
          source: accepted.source,
          playerId: accepted.playerId,
          requestId: accepted.requestId,
          action: asInputJson(accepted.action),
          response: asInputJson(accepted.responses),
          timeoutStreak: accepted.timeoutStreak,
        },
      });
      for (const event of accepted.events) {
        await transaction.matchEvent.create({
          data: { matchId: accepted.matchId, sequence: event.sequence, event: asInputJson(event) },
        });
      }
      if (accepted.snapshot !== undefined) {
        const snapshotState = withoutEvents(accepted.snapshot.state);
        await transaction.matchSnapshot.create({
          data: {
            matchId: accepted.matchId,
            actionIndex: accepted.snapshot.actionIndex,
            eventSequence: accepted.snapshot.eventSequence,
            state: asInputJson(snapshotState),
          },
        });
      }
      if (accepted.state.phase === 'MATCH_END') {
        const replay = recordReplay(accepted.initialState, accepted.actions, accepted.definitions);
        if (!replay.ok) throw new Error(`Cannot record PvP replay: ${replay.error.message}`);
        if (JSON.stringify(replay.replay.finalState) !== JSON.stringify(accepted.state))
          throw new Error('PvP replay final state does not match the accepted state.');
        if (match.mode === 'RANKED') await this.ranked.settleMatch(transaction, replay.replay);
        await transaction.match.update({
          where: { id: accepted.matchId },
          data: {
            status: 'COMPLETED',
            finalState: asInputJson(accepted.state),
            checksum: replay.replay.checksum,
            completedAt: new Date(),
          },
        });
      }
    });
  }

  async abandon(matchId: string): Promise<void> {
    await this.prisma.match.updateMany({
      where: { id: matchId, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', completedAt: new Date() },
    });
  }

  async setPlayerDisconnected(
    matchId: string,
    playerId: string,
    disconnectedAt: number | null,
  ): Promise<void> {
    await this.prisma.matchPlayer.updateMany({
      where: { matchId, playerId },
      data: {
        disconnectedAt: disconnectedAt === null ? null : new Date(disconnectedAt),
        ...(disconnectedAt === null ? { connectedOnce: true } : {}),
      },
    });
  }
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function withoutEvents(state: AcceptedAction['state']): Omit<AcceptedAction['state'], 'events'> {
  const { events, ...snapshotState } = state;
  void events;
  return snapshotState;
}

// Kept as a named reference so accidental client-authored PlayerId values are
// not introduced into the persistence adapter's public API.
export type PvpAuthenticatedPlayerId = PlayerId;

export type PvpPersistedEvent = GameEvent;
