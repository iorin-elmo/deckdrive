import type { BattleState, GameEvent, PlayerId } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { AcceptedAction } from './session.js';

/** Persists the accepted engine transition and its replay boundary atomically. */
export class PrismaPvpMatchPersistence {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    state: BattleState,
    players: readonly [
      { readonly playerId: string; readonly deckSnapshot: unknown },
      { readonly playerId: string; readonly deckSnapshot: unknown },
    ],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.match.create({
        data: {
          id: state.matchId,
          engineVersion: state.engineVersion,
          rulesVersion: state.rulesVersion,
          cardDataVersion: state.cardDataVersion,
          seed: state.seed,
          initialState: asInputJson(state),
          players: {
            create: players.map((player, index) => ({
              playerId: player.playerId,
              seat: index + 1,
              deckSnapshot: asInputJson(player.deckSnapshot),
            })),
          },
        },
      });
      const snapshotState = withoutEvents(state);
      await transaction.matchSnapshot.create({
        data: {
          matchId: state.matchId,
          actionIndex: 0,
          eventSequence: state.events.at(-1)?.sequence ?? 0,
          state: asInputJson(snapshotState),
        },
      });
    });
  }

  async append(accepted: AcceptedAction): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // A process-local session serializes normal traffic. This row lock also
      // protects the sequence boundary when more than one API worker exists.
      await transaction.$queryRaw`SELECT id FROM matches WHERE id = ${accepted.matchId} FOR UPDATE`;
      await transaction.matchAction.create({
        data: {
          matchId: accepted.matchId,
          sequence: accepted.sequence,
          action: asInputJson(accepted.action),
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
        await transaction.match.update({
          where: { id: accepted.matchId },
          data: {
            status: 'COMPLETED',
            finalState: asInputJson(accepted.state),
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
