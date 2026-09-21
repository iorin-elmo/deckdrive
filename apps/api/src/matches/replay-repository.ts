import { replayFormatVersion, verifyReplay } from '@deck-drive/game-engine';
import type { CardDefinition, Replay } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class ReplayNotFoundError extends Error {
  constructor(matchId: string) {
    super(`No persisted replay exists for match ${matchId}.`);
    this.name = 'ReplayNotFoundError';
  }
}

export class ReplayPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayPersistenceError';
  }
}

export class UnsupportedReplayFormatError extends ReplayPersistenceError {
  constructor(formatVersion: number) {
    super(`Replay format version ${String(formatVersion)} is not supported.`);
    this.name = 'UnsupportedReplayFormatError';
  }
}

/** Keeps database access outside the deterministic game engine. */
export class MatchReplayRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(replay: Replay): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const definitions = await this.loadCardDefinitions(
        replay.cardDataVersion,
        transaction.cardVersion,
      );
      const verification = verifyReplay(replay, definitions);
      if (!verification.ok) {
        throw new ReplayPersistenceError(
          `Cannot persist an invalid replay: ${verification.error.message}`,
        );
      }

      await transaction.match.create({
        data: {
          id: replay.matchId,
          status: replay.finalState.phase === 'MATCH_END' ? 'COMPLETED' : 'IN_PROGRESS',
          engineVersion: replay.engineVersion,
          rulesVersion: replay.rulesVersion,
          cardDataVersion: replay.cardDataVersion,
          formatVersion: replay.formatVersion,
          snapshotInterval: replay.snapshotInterval,
          seed: replay.seed,
          initialState: asInputJson(replay.initialState),
          finalState: asInputJson(replay.finalState),
          checksum: replay.checksum,
          completedAt: replay.finalState.phase === 'MATCH_END' ? new Date() : null,
        },
      });

      for (const [index, action] of replay.actions.entries()) {
        await transaction.matchAction.create({
          data: {
            matchId: replay.matchId,
            sequence: index + 1,
            action: asInputJson(action),
          },
        });
      }

      for (const event of replay.events) {
        await transaction.matchEvent.create({
          data: {
            matchId: replay.matchId,
            sequence: event.sequence,
            event: asInputJson(event),
          },
        });
      }

      for (const snapshot of replay.snapshots) {
        await transaction.matchSnapshot.create({
          data: {
            matchId: replay.matchId,
            actionIndex: snapshot.actionIndex,
            eventSequence: snapshot.eventSequence,
            state: asInputJson(snapshot.state),
          },
        });
      }
    });
  }

  async load(matchId: string): Promise<Replay> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        actions: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { sequence: 'asc' } },
        snapshots: { orderBy: { actionIndex: 'asc' } },
      },
    });
    if (match === null) throw new ReplayNotFoundError(matchId);
    if (match.formatVersion !== replayFormatVersion) {
      throw new UnsupportedReplayFormatError(match.formatVersion);
    }
    if (match.finalState === null || match.checksum === null) {
      throw new ReplayPersistenceError(`Persisted replay ${matchId} is incomplete.`);
    }

    const definitions = await this.loadCardDefinitions(
      match.cardDataVersion,
      this.prisma.cardVersion,
    );
    const replay = {
      formatVersion: match.formatVersion,
      matchId: match.id,
      engineVersion: match.engineVersion,
      rulesVersion: match.rulesVersion,
      cardDataVersion: match.cardDataVersion,
      seed: match.seed,
      initialState: match.initialState,
      actions: match.actions.map((action) => action.action),
      events: match.events.map((event) => event.event),
      snapshots: match.snapshots.map((snapshot) => ({
        actionIndex: snapshot.actionIndex,
        eventSequence: snapshot.eventSequence,
        state: snapshot.state,
      })),
      finalState: match.finalState,
      snapshotInterval: match.snapshotInterval,
      checksum: match.checksum,
    } as unknown as Replay;

    const verification = verifyReplay(replay, definitions);
    if (!verification.ok) {
      throw new ReplayPersistenceError(
        `Persisted replay ${matchId} cannot be reconstructed: ${verification.error.message}`,
      );
    }
    return replay;
  }

  private async loadCardDefinitions(
    cardDataVersion: string,
    cardVersion: Pick<PrismaClient['cardVersion'], 'findMany'>,
  ): Promise<readonly CardDefinition[]> {
    const versions = await cardVersion.findMany({
      where: { version: cardDataVersion },
      orderBy: { cardId: 'asc' },
      select: { definition: true },
    });
    if (versions.length === 0) {
      throw new ReplayPersistenceError(
        `No card definitions are available for card data version ${cardDataVersion}.`,
      );
    }
    return versions.map(({ definition }) => {
      if (!isCardDefinition(definition)) {
        throw new ReplayPersistenceError('Stored card definition has an invalid replay shape.');
      }
      return definition;
    });
  }
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isCardDefinition(value: unknown): value is CardDefinition {
  if (!isRecord(value) || !Array.isArray(value.effects)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isNonNegativeInteger(value.cost) &&
    value.effects.length > 0 &&
    value.effects.every(isCardEffect)
  );
}

function isCardEffect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'DAMAGE':
      return (
        isPositiveInteger(value.amount) && (value.target === 'SELF' || value.target === 'ENEMY')
      );
    case 'HEAL':
    case 'GAIN_BLOCK':
    case 'DRAW':
      return isPositiveInteger(value.amount) && value.target === 'SELF';
    case 'CUSTOM':
      return (
        typeof value.resolver === 'string' &&
        value.resolver.trim().length > 0 &&
        (value.target === 'SELF' || value.target === 'ENEMY')
      );
    default:
      return false;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
