import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  applyDebugBattleCommand,
  createInitialBattleState,
  replayDebugBattle,
  shuffleDebugDeck,
  type BattleState,
  type CardInstance,
  type DebugBattleCommand,
  type MatchId,
  type PlayerId,
} from '@deck-drive/game-engine';
import type { PackCard } from '@deck-drive/pack-engine';
import { maximumCardCopies } from '@deck-drive/card-definitions';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { missionPeriodStart } from '../missions/progression.js';
import { experienceForLevel } from '../missions/progression.js';
import { generatePackOpening } from '../packs/pack-opening.js';
import { packRarity } from '../packs/prisma-pack-opening.js';
import { PrismaRankedAnalytics } from '../ranked/prisma-analytics.js';
import { PrismaRankedReadService } from '../ranked/read-service.js';
import type { AdminCommand } from './contracts.js';
import {
  PrismaFeatureFlags,
  debugEnvironmentAllowed,
  featureFlagDefaults,
} from './feature-flags.js';

type Transaction = Prisma.TransactionClient;
type Change = {
  readonly target: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
};

export class AdminOperationError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(code);
  }
}

/** Every mutation and its audit entry commit in the same database transaction. */
export class PrismaAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async execute(adminUserId: string, command: AdminCommand) {
    const payloadHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const existing = await transaction.adminAction.findUnique({
              where: {
                adminUserId_requestId: { adminUserId, requestId: command.requestId },
              },
            });
            if (existing !== null) return replay(existing, payloadHash);
            const change = await this.apply(transaction, adminUserId, command);
            const action = await transaction.adminAction.create({
              data: {
                adminUserId,
                requestId: command.requestId,
                action: command.action,
                target: change.target,
                reason: command.reason,
                payloadHash,
                before: asJson(change.before),
                after: asJson(change.after),
              },
            });
            return { id: action.id, before: change.before, after: change.after, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isPrismaCode(error, 'P2002')) {
          const recorded = await this.prisma.adminAction.findUnique({
            where: { adminUserId_requestId: { adminUserId, requestId: command.requestId } },
          });
          if (recorded !== null) return replay(recorded, payloadHash);
        }
        if (isPrismaCode(error, 'P2034') && attempt < 2) continue;
        throw error;
      }
    }
    throw new AdminOperationError('ADMIN_RETRY_EXHAUSTED', 409);
  }

  async players(query: string) {
    const search = query.trim().slice(0, 100);
    const players = await this.prisma.player.findMany({
      where: search
        ? {
            user: {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {},
      select: {
        id: true,
        level: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return players.map(({ user, ...player }) => ({
      ...player,
      displayName: user.displayName,
      email: maskEmail(user.email),
    }));
  }

  async player(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        level: true,
        experience: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
        cards: { select: { cardVersionId: true, quantity: true } },
        cosmetics: { select: { cosmeticId: true, acquiredAt: true } },
        decks: { select: { id: true, name: true, cardDataVersion: true } },
      },
    });
    if (player === null) throw new AdminOperationError('PLAYER_NOT_FOUND', 404);
    const balances = await this.prisma.currencyTransaction.groupBy({
      by: ['currency'],
      where: { playerId },
      _sum: { amount: true },
    });
    const { user, ...rest } = player;
    return {
      ...rest,
      displayName: user.displayName,
      email: maskEmail(user.email),
      balances: Object.fromEntries(
        balances.map((entry) => [entry.currency, entry._sum.amount ?? 0]),
      ),
    };
  }

  async matches(query: string) {
    const search = query.trim().slice(0, 100);
    return this.prisma.match.findMany({
      where: search ? { id: { contains: search } } : {},
      select: {
        id: true,
        mode: true,
        status: true,
        createdAt: true,
        completedAt: true,
        players: { select: { playerId: true, seat: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async replay(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: { select: { playerId: true, seat: true }, orderBy: { seat: 'asc' } },
        actions: { select: { sequence: true, action: true }, orderBy: { sequence: 'asc' } },
        serverCommands: {
          select: { sequence: true, command: true },
          orderBy: { sequence: 'asc' },
        },
        events: { select: { sequence: true, event: true }, orderBy: { sequence: 'asc' } },
        snapshots: {
          select: { inputSequence: true, actionIndex: true, eventSequence: true, state: true },
          orderBy: { eventSequence: 'asc' },
        },
      },
    });
    if (match === null) throw new AdminOperationError('MATCH_NOT_FOUND', 404);
    return match;
  }

  async rating(playerId: string) {
    await this.assertPlayer(playerId);
    const reader = new PrismaRankedReadService(this.prisma);
    return { profile: await reader.profile(playerId), history: await reader.history(playerId) };
  }

  async rankedReport(seasonId: string) {
    return new PrismaRankedAnalytics(this.prisma).report(seasonId);
  }

  async rankedFlags(seasonId: string) {
    return new PrismaRankedAnalytics(this.prisma).flags(seasonId);
  }

  async flags() {
    return new PrismaFeatureFlags(this.prisma, this.environment.NODE_ENV).list();
  }

  async audit(cursor?: string) {
    if (
      cursor !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(cursor)
    )
      throw new AdminOperationError('INVALID_AUDIT_CURSOR', 400);
    const rows = await this.prisma.adminAction.findMany({
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 101,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        adminUserId: true,
        requestId: true,
        action: true,
        target: true,
        reason: true,
        before: true,
        after: true,
        timestamp: true,
      },
    });
    const items = rows.slice(0, 100);
    return { items, nextCursor: rows.length > 100 ? items.at(-1)!.id : null };
  }

  async debugBattle(battleId: string) {
    if (
      !debugEnvironmentAllowed(this.environment.NODE_ENV) ||
      !(await new PrismaFeatureFlags(this.prisma, this.environment.NODE_ENV).enabled(
        'ENABLE_DEBUG',
      ))
    )
      throw new AdminOperationError('DEBUG_DISABLED', 409);
    const battle = await this.prisma.debugBattle.findUnique({ where: { id: battleId } });
    if (battle === null) throw new AdminOperationError('DEBUG_BATTLE_NOT_FOUND', 404);
    const calculated = replayDebugBattle(
      battle.initialState as unknown as BattleState,
      battle.commands as unknown as DebugBattleCommand[],
    );
    if (!isDeepStrictEqual(calculated, battle.state))
      throw new AdminOperationError('DEBUG_BATTLE_REPLAY_MISMATCH', 409);
    return battle;
  }

  private async assertPlayer(playerId: string, transaction: Transaction = this.prisma) {
    const player = await transaction.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (player === null) throw new AdminOperationError('PLAYER_NOT_FOUND', 404);
  }

  private async apply(
    transaction: Transaction,
    adminUserId: string,
    command: AdminCommand,
  ): Promise<Change> {
    if (isDebugAction(command.action)) {
      if (
        !debugEnvironmentAllowed(this.environment.NODE_ENV) ||
        !(await new PrismaFeatureFlags(
          transaction as PrismaClient,
          this.environment.NODE_ENV,
        ).enabled('ENABLE_DEBUG'))
      )
        throw new AdminOperationError('DEBUG_DISABLED', 409);
    }
    switch (command.action) {
      case 'GRANT_CURRENCY': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const before = await currencyBalance(transaction, command.playerId, command.currency);
        await transaction.currencyTransaction.create({
          data: {
            playerId: command.playerId,
            currency: command.currency,
            amount: command.amount,
            reason: `ADMIN:${command.reason}`,
            idempotencyKey: `admin:${adminUserId}:${command.requestId}`,
          },
        });
        return {
          target: `player:${command.playerId}:currency:${command.currency}`,
          before: { balance: before },
          after: { balance: before + command.amount },
        };
      }
      case 'GRANT_CARD': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const card = await transaction.cardVersion.findUnique({
          where: { id: command.cardVersionId },
          select: { id: true },
        });
        if (card === null) throw new AdminOperationError('CARD_NOT_FOUND', 404);
        const owned = await transaction.playerCard.findUnique({
          where: {
            playerId_cardVersionId: {
              playerId: command.playerId,
              cardVersionId: command.cardVersionId,
            },
          },
        });
        const before = owned?.quantity ?? 0;
        if (before + command.quantity > maximumCardCopies)
          throw new AdminOperationError('CARD_COPY_LIMIT', 409);
        await transaction.playerCard.upsert({
          where: {
            playerId_cardVersionId: {
              playerId: command.playerId,
              cardVersionId: command.cardVersionId,
            },
          },
          create: {
            playerId: command.playerId,
            cardVersionId: command.cardVersionId,
            quantity: command.quantity,
          },
          update: { quantity: before + command.quantity },
        });
        return {
          target: `player:${command.playerId}:card:${command.cardVersionId}`,
          before: { quantity: before },
          after: { quantity: before + command.quantity },
        };
      }
      case 'GRANT_COSMETIC': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const cosmetic = await transaction.cosmetic.findUnique({
          where: { id: command.cosmeticId },
          select: { id: true },
        });
        if (cosmetic === null) throw new AdminOperationError('COSMETIC_NOT_FOUND', 404);
        const current = await transaction.playerCosmetic.findUnique({
          where: {
            playerId_cosmeticId: {
              playerId: command.playerId,
              cosmeticId: command.cosmeticId,
            },
          },
        });
        await transaction.cosmeticGrant.create({
          data: {
            playerId: command.playerId,
            cosmeticId: command.cosmeticId,
            source: 'ADMIN',
            idempotencyKey: `admin:${adminUserId}:${command.requestId}`,
          },
        });
        await transaction.playerCosmetic.upsert({
          where: {
            playerId_cosmeticId: {
              playerId: command.playerId,
              cosmeticId: command.cosmeticId,
            },
          },
          create: {
            playerId: command.playerId,
            cosmeticId: command.cosmeticId,
            source: 'ADMIN',
            idempotencyKey: `admin:${adminUserId}:${command.requestId}`,
          },
          update: {},
        });
        return {
          target: `player:${command.playerId}:cosmetic:${command.cosmeticId}`,
          before: { owned: current !== null },
          after: { owned: true },
        };
      }
      case 'COMPLETE_MISSION': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const mission = await transaction.mission.findUnique({ where: { id: command.missionId } });
        if (mission === null) throw new AdminOperationError('MISSION_NOT_FOUND', 404);
        const periodStart = missionPeriodStart(mission.cadence, new Date());
        const key = {
          playerId: command.playerId,
          missionId: command.missionId,
          periodStart,
        };
        const existing = await transaction.playerMission.findUnique({
          where: { playerId_missionId_periodStart: key },
        });
        await transaction.playerMission.upsert({
          where: { playerId_missionId_periodStart: key },
          create: { ...key, progress: mission.target },
          update: { progress: { set: Math.max(existing?.progress ?? 0, mission.target) } },
        });
        return {
          target: `player:${command.playerId}:mission:${command.missionId}:period:${periodStart.toISOString()}`,
          before: { progress: existing?.progress ?? 0, claimedAt: existing?.claimedAt ?? null },
          after: {
            progress: Math.max(existing?.progress ?? 0, mission.target),
            claimedAt: existing?.claimedAt ?? null,
          },
        };
      }
      case 'SET_FLAG': {
        if (
          command.name === 'ENABLE_DEBUG' &&
          command.enabled &&
          !debugEnvironmentAllowed(this.environment.NODE_ENV)
        )
          throw new AdminOperationError('PRODUCTION_DEBUG_FORBIDDEN', 409);
        const existing = await transaction.featureFlag.findUnique({
          where: { name: command.name },
        });
        await transaction.featureFlag.upsert({
          where: { name: command.name },
          create: { name: command.name, enabled: command.enabled },
          update: { enabled: command.enabled },
        });
        return {
          target: `flag:${command.name}`,
          before: {
            enabled:
              command.name === 'ENABLE_DEBUG' && !debugEnvironmentAllowed(this.environment.NODE_ENV)
                ? false
                : (existing?.enabled ?? featureFlagDefaults[command.name]),
          },
          after: { enabled: command.enabled },
        };
      }
      case 'SIMULATE_PACK': {
        const versions = await transaction.cardVersion.findMany({
          select: { id: true, definition: true },
          orderBy: { id: 'asc' },
        });
        const pool = versions.flatMap((version): PackCard[] => {
          const rarity = packRarity(version.definition);
          return rarity === undefined ? [] : [{ id: version.id, rarity }];
        });
        if (pool.length === 0) throw new AdminOperationError('PACK_POOL_UNAVAILABLE', 409);
        const result = generatePackOpening({
          productId: command.productId,
          seed: command.seed,
          pool,
        });
        return {
          target: `pack-simulation:${command.productId}`,
          before: {},
          after: { seed: command.seed, results: result.results },
        };
      }
      case 'GIVE_ALL_CARDS': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const versions = await transaction.cardVersion.findMany({ select: { id: true } });
        const owned = await transaction.playerCard.findMany({
          where: { playerId: command.playerId },
          select: { cardVersionId: true, quantity: true },
        });
        const before = Object.fromEntries(owned.map((card) => [card.cardVersionId, card.quantity]));
        for (const version of versions) {
          await transaction.playerCard.upsert({
            where: {
              playerId_cardVersionId: { playerId: command.playerId, cardVersionId: version.id },
            },
            create: {
              playerId: command.playerId,
              cardVersionId: version.id,
              quantity: maximumCardCopies,
            },
            update: { quantity: maximumCardCopies },
          });
        }
        return {
          target: `player:${command.playerId}:cards`,
          before: { quantities: before },
          after: {
            quantities: Object.fromEntries(
              versions.map((version) => [version.id, maximumCardCopies]),
            ),
          },
        };
      }
      case 'SET_GEM': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const before = await currencyBalance(transaction, command.playerId, 'GEM');
        const delta = command.value - before;
        if (delta !== 0)
          await transaction.currencyTransaction.create({
            data: {
              playerId: command.playerId,
              currency: 'GEM',
              amount: delta,
              reason: `ADMIN_DEBUG:${command.reason}`,
              idempotencyKey: `admin:${adminUserId}:${command.requestId}`,
            },
          });
        return {
          target: `player:${command.playerId}:currency:GEM`,
          before: { balance: before },
          after: { balance: command.value },
        };
      }
      case 'SET_LEVEL': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const before = await transaction.player.findUniqueOrThrow({
          where: { id: command.playerId },
          select: { level: true, experience: true },
        });
        const experience = experienceForLevel(command.value);
        await transaction.player.update({
          where: { id: command.playerId },
          data: { level: command.value, experience },
        });
        return {
          target: `player:${command.playerId}:level`,
          before,
          after: { level: command.value, experience },
        };
      }
      case 'SET_RATING': {
        await this.assertPlayer(command.playerId, transaction);
        await lockPlayer(transaction, command.playerId);
        const now = new Date();
        const season = await transaction.season.findFirst({
          where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
          select: { id: true, initialRating: true },
        });
        if (season === null) throw new AdminOperationError('ACTIVE_SEASON_NOT_FOUND', 404);
        const key = { seasonId: season.id, playerId: command.playerId };
        const previous = await transaction.playerSeasonRating.findUnique({
          where: { seasonId_playerId: key },
          select: { rating: true },
        });
        await transaction.playerSeasonRating.upsert({
          where: { seasonId_playerId: key },
          create: { ...key, rating: command.value },
          update: { rating: command.value },
        });
        return {
          target: `player:${command.playerId}:season:${season.id}:rating`,
          before: { rating: previous?.rating ?? season.initialRating },
          after: { rating: command.value },
        };
      }
      case 'START_DEBUG_BATTLE': {
        const decks = await Promise.all(
          [command.firstDeckId, command.secondDeckId].map((id) =>
            transaction.deck.findUnique({
              where: { id },
              include: { cards: { orderBy: { position: 'asc' } } },
            }),
          ),
        );
        const [first, second] = decks;
        if (first === null || second === null || first === undefined || second === undefined)
          throw new AdminOperationError('DECK_NOT_FOUND', 404);
        if (first.playerId === second.playerId || first.cardDataVersion !== second.cardDataVersion)
          throw new AdminOperationError('INCOMPATIBLE_DEBUG_DECKS', 409);
        const battleId = randomUUID();
        const state = createInitialBattleState({
          matchId: battleId as MatchId,
          engineVersion: '1.0.0',
          rulesVersion: '1.0.0',
          cardDataVersion: first.cardDataVersion,
          seed: command.seed,
          initialDrawCount: 5,
          turnDrawCount: 1,
          players: [first, second].map((deck) => ({
            id: deck.playerId as PlayerId,
            drawPile: shuffleDebugDeck(
              deck.cards.flatMap((card) =>
                Array.from({ length: card.quantity }, (_, index): CardInstance => ({
                  id: `${card.id}:${index}` as CardInstance['id'],
                  definitionId: card.cardVersionId,
                })),
              ),
              `${command.seed}:${deck.playerId}`,
            ),
          })),
        });
        await transaction.debugBattle.create({
          data: {
            id: battleId,
            adminUserId,
            initialState: asJson(state),
            state: asJson(state),
            commands: [],
          },
        });
        return { target: `debug-battle:${battleId}`, before: {}, after: { battleId, state } };
      }
      case 'DEBUG_BATTLE_COMMAND': {
        const battle = await transaction.debugBattle.findUnique({
          where: { id: command.battleId },
        });
        if (battle === null) throw new AdminOperationError('DEBUG_BATTLE_NOT_FOUND', 404);
        const before = battle.state as unknown as BattleState;
        let after: BattleState;
        try {
          after = applyDebugBattleCommand(before, command.command as DebugBattleCommand);
        } catch (error) {
          if (error instanceof RangeError) throw new AdminOperationError(error.message, 409);
          throw error;
        }
        const commands = battle.commands as unknown as DebugBattleCommand[];
        if (commands.length >= 200) throw new AdminOperationError('DEBUG_COMMAND_LIMIT', 409);
        await transaction.debugBattle.update({
          where: { id: command.battleId },
          data: { state: asJson(after), commands: asJson([...commands, command.command]) },
        });
        return {
          target: `debug-battle:${command.battleId}`,
          before: { state: before },
          after: { state: after },
        };
      }
    }
  }
}

function isDebugAction(action: AdminCommand['action']): boolean {
  return [
    'GIVE_ALL_CARDS',
    'SET_GEM',
    'SET_LEVEL',
    'SET_RATING',
    'START_DEBUG_BATTLE',
    'DEBUG_BATTLE_COMMAND',
  ].includes(action);
}

function replay(
  action: { id: string; payloadHash: string; before: Prisma.JsonValue; after: Prisma.JsonValue },
  payloadHash: string,
) {
  if (action.payloadHash !== payloadHash)
    throw new AdminOperationError('ADMIN_REQUEST_CONFLICT', 409);
  return { id: action.id, before: action.before, after: action.after, replayed: true };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function lockPlayer(transaction: Transaction, playerId: string): Promise<void> {
  await transaction.$queryRaw`SELECT id FROM players WHERE id = ${playerId}::uuid FOR UPDATE`;
}

async function currencyBalance(
  transaction: Transaction,
  playerId: string,
  currency: 'GEM' | 'EXCHANGE_POINT',
): Promise<number> {
  const result = await transaction.currencyTransaction.aggregate({
    where: { playerId, currency },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}
