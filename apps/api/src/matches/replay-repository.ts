import {
  calculateDraftDefinitionRevision,
  replayFormatVersion,
  replayFormatVersionV2,
  verifyReplay,
  verifyReplayV2,
} from '@deck-drive/game-engine';
import type {
  CardDefinition,
  CardDefinitionV2,
  Replay,
  ReplayV2,
  ServerCommandAuthorizer,
} from '@deck-drive/game-engine';
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

/** Keeps database access and trusted command authorization outside the deterministic game engine. */
export class MatchReplayRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly authorizeServerCommand?: ServerCommandAuthorizer,
  ) {}

  async save(replay: Replay | ReplayV2): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const definitions = await this.loadCardDefinitions(
        replay.cardDataVersion,
        transaction.cardVersion,
      );
      this.assertValidReplay(replay, definitions);

      if (replay.formatVersion === replayFormatVersionV2) {
        await transaction.replayDefinitionSnapshot.upsert({
          where: { revision: replay.draftDefinitionRevision },
          create: {
            revision: replay.draftDefinitionRevision,
            definitions: asInputJson(definitions),
          },
          update: {},
        });
      }

      await transaction.match.create({
        data: {
          id: replay.matchId,
          status: replay.finalState.phase === 'MATCH_END' ? 'COMPLETED' : 'IN_PROGRESS',
          engineVersion: replay.engineVersion,
          rulesVersion: replay.rulesVersion,
          cardDataVersion: replay.cardDataVersion,
          formatVersion: replay.formatVersion,
          battleProtocolVersion:
            replay.formatVersion === replayFormatVersionV2 ? replay.battleProtocolVersion : null,
          draftDefinitionRevision:
            replay.formatVersion === replayFormatVersionV2 ? replay.draftDefinitionRevision : null,
          snapshotInterval: replay.snapshotInterval,
          seed: replay.seed,
          initialState: asInputJson(replay.initialState),
          finalState: asInputJson(replay.finalState),
          checksum: replay.checksum,
          completedAt: replay.finalState.phase === 'MATCH_END' ? new Date() : null,
        },
      });

      const actions =
        replay.formatVersion === replayFormatVersion
          ? replay.actions.map((payload, index) => ({ sequence: index + 1, payload }))
          : replay.actions.map((record) => ({
              sequence: record.inputSequence,
              payload: record.payload,
            }));
      for (const action of actions) {
        await transaction.matchAction.create({
          data: {
            matchId: replay.matchId,
            sequence: action.sequence,
            action: asInputJson(action.payload),
          },
        });
      }

      if (replay.formatVersion === replayFormatVersionV2) {
        for (const command of replay.serverCommands) {
          await transaction.matchServerCommand.create({
            data: {
              matchId: replay.matchId,
              sequence: command.inputSequence,
              command: asInputJson(command.payload),
            },
          });
        }
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

      if (replay.formatVersion === replayFormatVersion) {
        for (const snapshot of replay.snapshots) {
          await transaction.matchSnapshot.create({
            data: {
              matchId: replay.matchId,
              actionIndex: snapshot.actionIndex,
              inputSequence: null,
              eventSequence: snapshot.eventSequence,
              state: asInputJson(snapshot.state),
            },
          });
        }
      } else {
        for (const snapshot of replay.snapshots) {
          await transaction.matchSnapshot.create({
            data: {
              matchId: replay.matchId,
              actionIndex: null,
              inputSequence: snapshot.inputSequence,
              eventSequence: snapshot.eventSequence,
              state: asInputJson(snapshot.state),
            },
          });
        }
      }
    });
  }

  async load(matchId: string): Promise<Replay | ReplayV2> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        actions: { orderBy: { sequence: 'asc' } },
        serverCommands: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { sequence: 'asc' } },
        snapshots: true,
      },
    });
    if (match === null) throw new ReplayNotFoundError(matchId);
    if (
      match.formatVersion !== replayFormatVersion &&
      match.formatVersion !== replayFormatVersionV2
    ) {
      throw new UnsupportedReplayFormatError(match.formatVersion);
    }
    if (match.finalState === null || match.checksum === null) {
      throw new ReplayPersistenceError(`Persisted replay ${matchId} is incomplete.`);
    }
    if (
      match.formatVersion === replayFormatVersionV2 &&
      (match.battleProtocolVersion !== 2 || match.draftDefinitionRevision === null)
    ) {
      throw new ReplayPersistenceError(`Persisted replay ${matchId} is missing V2 metadata.`);
    }

    const definitions =
      match.formatVersion === replayFormatVersion
        ? await this.loadCardDefinitions(match.cardDataVersion, this.prisma.cardVersion)
        : await this.loadDefinitionSnapshot(
            match.draftDefinitionRevision!,
            this.prisma.replayDefinitionSnapshot,
          );
    const common = {
      matchId: match.id,
      engineVersion: match.engineVersion,
      rulesVersion: match.rulesVersion,
      cardDataVersion: match.cardDataVersion,
      seed: match.seed,
      initialState: match.initialState,
      events: match.events.map((event) => event.event),
      finalState: match.finalState,
      snapshotInterval: match.snapshotInterval,
      checksum: match.checksum,
    };

    let replay: Replay | ReplayV2;
    if (match.formatVersion === replayFormatVersion) {
      replay = {
        ...common,
        formatVersion: replayFormatVersion,
        actions: match.actions.map((action) => action.action),
        snapshots: match.snapshots
          .filter((snapshot) => snapshot.actionIndex !== null)
          .sort((left, right) => left.actionIndex! - right.actionIndex!)
          .map((snapshot) => ({
            actionIndex: snapshot.actionIndex!,
            eventSequence: snapshot.eventSequence,
            state: snapshot.state,
          })),
      } as unknown as Replay;
    } else {
      replay = {
        ...common,
        formatVersion: replayFormatVersionV2,
        battleProtocolVersion: 2,
        draftDefinitionRevision: match.draftDefinitionRevision,
        actions: match.actions.map((action) => ({
          inputSequence: action.sequence,
          payload: action.action,
        })),
        serverCommands: match.serverCommands.map((command) => ({
          inputSequence: command.sequence,
          payload: command.command,
        })),
        snapshots: match.snapshots
          .filter((snapshot) => snapshot.inputSequence !== null)
          .sort((left, right) => left.inputSequence! - right.inputSequence!)
          .map((snapshot) => ({
            inputSequence: snapshot.inputSequence!,
            eventSequence: snapshot.eventSequence,
            state: snapshot.state,
          })),
      } as unknown as ReplayV2;
    }

    this.assertValidReplay(replay, definitions);
    return replay;
  }

  private assertValidReplay(
    replay: Replay | ReplayV2,
    definitions: readonly CardDefinitionV2[],
  ): void {
    const verification =
      replay.formatVersion === replayFormatVersion
        ? verifyReplay(replay, definitions as readonly CardDefinition[])
        : this.verifyReplayV2(replay, definitions);
    if (!verification.ok) {
      throw new ReplayPersistenceError(
        `Cannot persist or reconstruct an invalid replay: ${verification.error.message}`,
      );
    }
  }

  private verifyReplayV2(
    replay: ReplayV2,
    definitions: readonly CardDefinitionV2[],
  ): ReturnType<typeof verifyReplayV2> {
    if (this.authorizeServerCommand === undefined) {
      throw new ReplayPersistenceError(
        'A battle server-command verifier is required for Replay V2.',
      );
    }
    return verifyReplayV2(
      replay,
      (revision) =>
        calculateDraftDefinitionRevision(definitions) === revision ? definitions : undefined,
      this.authorizeServerCommand,
    );
  }

  private async loadCardDefinitions(
    cardDataVersion: string,
    cardVersion: Pick<PrismaClient['cardVersion'], 'findMany'>,
  ): Promise<readonly CardDefinitionV2[]> {
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

  private async loadDefinitionSnapshot(
    revision: string,
    snapshot: Pick<PrismaClient['replayDefinitionSnapshot'], 'findUnique'>,
  ): Promise<readonly CardDefinitionV2[]> {
    const stored = await snapshot.findUnique({ where: { revision } });
    if (stored === null || !Array.isArray(stored.definitions)) {
      throw new ReplayPersistenceError(
        `No immutable card definition snapshot exists for revision ${revision}.`,
      );
    }
    const definitions = stored.definitions.map((definition) => {
      if (!isCardDefinition(definition)) {
        throw new ReplayPersistenceError('Stored card definition has an invalid replay shape.');
      }
      return definition;
    });
    if (calculateDraftDefinitionRevision(definitions) !== revision) {
      throw new ReplayPersistenceError(
        `Stored card definition snapshot does not match revision ${revision}.`,
      );
    }
    return definitions;
  }
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isCardDefinition(value: unknown): value is CardDefinitionV2 {
  if (!isRecord(value) || !Array.isArray(value.effects)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.version === 'string' &&
    value.version.length > 0 &&
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
    case 'GAIN_ENERGY':
      return isPositiveInteger(value.amount) && value.target === 'SELF';
    case 'START_CHANT':
      return (
        isPositiveInteger(value.countdown) &&
        (value.damageDelay === undefined || isNonNegativeInteger(value.damageDelay)) &&
        Array.isArray(value.completionEffects) &&
        value.completionEffects.length > 0 &&
        value.completionEffects.every(isCardEffect)
      );
    case 'ADVANCE_CHANT':
      return (
        isPositiveInteger(value.amount) &&
        (value.drawOnComplete === undefined || typeof value.drawOnComplete === 'boolean')
      );
    case 'EXHAUST_GRIMOIRE_ADVANCE_WISH':
      return isPositiveInteger(value.amount);
    case 'RESOLVE_ALL_CHANTS':
      return isNonNegativeInteger(value.blockPerChant);
    case 'GAIN_BLOCK_PER_CHANT':
      return isPositiveInteger(value.amount);
    case 'SYNTHESIZE':
      return ['NORMAL', 'SAGE_RECIPE', 'COMPLETE_REACTION', 'ALL_MATERIALS'].includes(
        String(value.mode),
      );
    case 'DRAW_SYNTHESIS_COUNT':
      return isPositiveInteger(value.maximum);
    case 'SET_ALCHEMY_STAGE':
      return value.requiredStage === 1 && value.stage === 3;
    case 'SPECIAL_VICTORY':
      return (
        (value.specialVictoryId === 'MAGE_GRAND_WISH' ||
          value.specialVictoryId === 'ALCHEMY_SAGE_STONE') &&
        (value.requiredAlchemyStage === undefined || value.requiredAlchemyStage === 3)
      );
    case 'REQUEST_CARD_CHOICE':
      return (
        value.from === 'DRAW_PILE' &&
        (value.maximumCost === undefined || isNonNegativeInteger(value.maximumCost))
      );
    case 'TRANSFORM_HAND_CARD':
    case 'SEAL_GRIMOIRE':
      return true;
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
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
