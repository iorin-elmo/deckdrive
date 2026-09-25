import { randomUUID } from 'node:crypto';

import { createInitialBattleState } from '@deck-drive/game-engine';
import type { CardDefinition, CardInstance, MatchId, PlayerId } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  DevelopmentAuthenticationDisabledError,
  assertDevelopmentAuthentication,
} from '../auth/development-auth.js';
import type { CpuDifficulty } from '../cpu/strategy.js';
import {
  DeckValidationError,
  deckSize,
  validateDeckCards,
  type DeckCardInput,
} from '../decks/deck-validation.js';
import {
  InsufficientGemError,
  IdempotencyConflictError,
  PackPoolUnavailableError,
  PackPurchaseLimitError,
  PrismaPackOpeningService,
} from '../packs/prisma-pack-opening.js';
import {
  PackOpeningValidationError,
  packProducts,
  type ApiPackProduct,
} from '../packs/pack-opening.js';
import { RewardValidationError } from '../rewards/reward-ledger.js';
import {
  MissionNotFoundError,
  MissionNotReadyError,
  PrismaMissionService,
} from '../missions/prisma-mission-service.js';
import { PrismaProgressionService } from '../missions/prisma-progression-service.js';

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Framework-neutral `/api/v1` controller. A Node or edge adapter can call it directly. */
export class ApiApplication {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      const path = request.path;
      if (request.method === 'POST' && path === '/api/v1/auth/development') {
        return await this.developmentLogin(request.body);
      }
      if (request.method === 'GET' && path === '/api/v1/cards') return await this.listCards();
      const cardId = path.match(/^\/api\/v1\/cards\/([^/]+)$/u)?.[1];
      if (request.method === 'GET' && cardId !== undefined) return await this.getCard(cardId);

      const deckId = path.match(/^\/api\/v1\/decks\/([^/]+)$/u)?.[1];
      const matchId = path.match(/^\/api\/v1\/matches\/([^/]+)$/u)?.[1];
      const packProductId = path.match(/^\/api\/v1\/packs\/([^/]+)\/open$/u)?.[1];
      const missionId = path.match(/^\/api\/v1\/missions\/([^/]+)\/claim$/u)?.[1];
      const authenticatedRoute =
        (request.method === 'GET' &&
          (path === '/api/v1/me' ||
            path === '/api/v1/collection' ||
            path === '/api/v1/decks' ||
            path === '/api/v1/packs' ||
            path === '/api/v1/missions' ||
            path === '/api/v1/progression' ||
            path === '/api/v1/cosmetics')) ||
        (request.method === 'POST' &&
          (path === '/api/v1/decks' ||
            path === '/api/v1/matches' ||
            path === '/api/v1/login-rewards/claim' ||
            packProductId !== undefined ||
            missionId !== undefined)) ||
        (deckId !== undefined && (request.method === 'PUT' || request.method === 'DELETE')) ||
        (matchId !== undefined && request.method === 'GET');
      if (!authenticatedRoute) return { status: 404, body: { error: 'NOT_FOUND' } };

      const player = await this.requirePlayer(request);
      if (request.method === 'GET' && path === '/api/v1/me') return await this.me(player.id);
      if (request.method === 'GET' && path === '/api/v1/collection')
        return await this.collection(player.id);
      if (request.method === 'GET' && path === '/api/v1/decks')
        return await this.listDecks(player.id);
      if (request.method === 'GET' && path === '/api/v1/packs') return this.listPacks();
      if (request.method === 'GET' && path === '/api/v1/missions')
        return await this.listMissions(player.id);
      if (request.method === 'GET' && path === '/api/v1/progression')
        return await this.progression(player.id);
      if (request.method === 'GET' && path === '/api/v1/cosmetics')
        return await this.listCosmetics(player.id);
      if (request.method === 'POST' && packProductId !== undefined)
        return await this.openPack(player.id, packProductId, request);
      if (request.method === 'POST' && missionId !== undefined)
        return await this.claimMission(player.id, missionId);
      if (request.method === 'POST' && path === '/api/v1/login-rewards/claim')
        return await this.claimLoginReward(player.id);
      if (request.method === 'POST' && path === '/api/v1/decks')
        return await this.createDeck(player.id, request.body);
      if (deckId !== undefined && request.method === 'PUT')
        return await this.updateDeck(player.id, deckId, request.body);
      if (deckId !== undefined && request.method === 'DELETE')
        return await this.deleteDeck(player.id, deckId);
      if (request.method === 'POST' && path === '/api/v1/matches')
        return await this.startCpuMatch(player.id, request.body);
      if (matchId !== undefined && request.method === 'GET')
        return await this.getMatch(player.id, matchId);
      return { status: 404, body: { error: 'NOT_FOUND' } };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  private async developmentLogin(body: unknown): Promise<ApiResponse> {
    assertDevelopmentAuthentication(this.environment);
    const value = object(body);
    const email = string(value.email, 'email');
    const displayName = string(value.displayName, 'displayName');
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { displayName },
      create: { email, displayName },
    });
    const player = await this.prisma.player.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    return { status: 200, body: { playerId: player.id, displayName: user.displayName } };
  }

  private async listCards(): Promise<ApiResponse> {
    const cards = sortVersionedCards(
      await this.prisma.cardVersion.findMany({
        orderBy: { cardId: 'asc' },
        select: { cardId: true, version: true, definition: true },
      }),
    );
    return { status: 200, body: { cards } };
  }

  private async getCard(cardId: string): Promise<ApiResponse> {
    const [card] = sortVersionedCards(
      await this.prisma.cardVersion.findMany({
        where: { cardId },
        select: { cardId: true, version: true, definition: true },
      }),
    );
    return card === undefined
      ? { status: 404, body: { error: 'CARD_NOT_FOUND' } }
      : { status: 200, body: card };
  }

  private async me(playerId: string): Promise<ApiResponse> {
    const player = await this.prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      include: { user: { select: { displayName: true } } },
    });
    const balances = await this.prisma.currencyTransaction.groupBy({
      by: ['currency'],
      where: { playerId },
      _sum: { amount: true },
    });
    return {
      status: 200,
      body: {
        id: player.id,
        displayName: player.user.displayName,
        balances: Object.fromEntries(
          balances.map((entry) => [entry.currency, entry._sum.amount ?? 0]),
        ),
      },
    };
  }

  private async listDecks(playerId: string): Promise<ApiResponse> {
    const decks = await this.prisma.deck.findMany({
      where: { playerId },
      orderBy: { updatedAt: 'desc' },
      include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
    });
    return { status: 200, body: { decks } };
  }

  private async collection(playerId: string): Promise<ApiResponse> {
    const cards = await this.prisma.playerCard.findMany({
      where: { playerId },
      orderBy: { updatedAt: 'asc' },
      include: { cardVersion: true },
    });
    return {
      status: 200,
      body: {
        cardDataVersion: currentCardDataVersion(this.environment),
        cards: cards.map((card) => ({
          cardVersionId: card.cardVersionId,
          quantity: card.quantity,
          cardVersion: {
            cardId: card.cardVersion.cardId,
            version: card.cardVersion.version,
            definition: card.cardVersion.definition,
          },
        })),
      },
    };
  }

  private listPacks(): ApiResponse {
    return {
      status: 200,
      body: {
        products: packProducts.map((product) => ({
          id: product.id,
          gemCost: product.gemCost,
          limit: product.limit,
        })),
      },
    };
  }

  private async listMissions(playerId: string): Promise<ApiResponse> {
    return {
      status: 200,
      body: { missions: await new PrismaMissionService(this.prisma).list(playerId) },
    };
  }

  private async claimMission(playerId: string, missionId: string): Promise<ApiResponse> {
    return {
      status: 200,
      body: await new PrismaMissionService(this.prisma).claim(playerId, missionId),
    };
  }

  private async claimLoginReward(playerId: string): Promise<ApiResponse> {
    return {
      status: 200,
      body: await new PrismaMissionService(this.prisma).claimLoginReward(playerId),
    };
  }

  private async progression(playerId: string): Promise<ApiResponse> {
    const today = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
    );
    const [player, lastLoginClaim] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({
        where: { id: playerId },
        select: { experience: true, level: true },
      }),
      this.prisma.loginRewardClaim.findUnique({
        where: { playerId_day: { playerId, day: today } },
      }),
    ]);
    return { status: 200, body: { ...player, loginClaimedToday: lastLoginClaim !== null } };
  }

  private async listCosmetics(playerId: string): Promise<ApiResponse> {
    const cosmetics = await this.prisma.cosmetic.findMany({
      orderBy: [{ kind: 'asc' }, { id: 'asc' }],
      include: { owners: { where: { playerId }, select: { acquiredAt: true } } },
    });
    return {
      status: 200,
      body: {
        cosmetics: cosmetics.map(({ owners, ...cosmetic }) => ({
          ...cosmetic,
          acquiredAt: owners[0]?.acquiredAt ?? null,
        })),
      },
    };
  }

  private async openPack(
    playerId: string,
    productId: string,
    request: ApiRequest,
  ): Promise<ApiResponse> {
    if (!packProducts.some((product) => product.id === productId))
      throw new BadRequestError('Unknown pack product.');
    const idempotencyKey = header(request.headers, 'idempotency-key');
    if (idempotencyKey === undefined || idempotencyKey.trim().length === 0)
      throw new BadRequestError('idempotency-key is required.');
    const result = await new PrismaPackOpeningService(this.prisma).open({
      playerId,
      productId: productId as ApiPackProduct,
      idempotencyKey,
    });
    return { status: 200, body: result };
  }

  private async createDeck(playerId: string, body: unknown): Promise<ApiResponse> {
    const input = deckInput(body);
    await this.validateOwnedDeck(playerId, input.cardDataVersion, input.cards);
    const deck = await this.prisma.deck.create({
      data: {
        playerId,
        name: input.name,
        cardDataVersion: input.cardDataVersion,
        cards: {
          create: input.cards.map(({ cardVersionId, position, quantity }) => ({
            cardVersionId,
            position,
            quantity,
          })),
        },
      },
      include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
    });
    return { status: 201, body: deck };
  }

  private async updateDeck(playerId: string, deckId: string, body: unknown): Promise<ApiResponse> {
    const input = deckInput(body);
    await this.validateOwnedDeck(playerId, input.cardDataVersion, input.cards);
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, playerId },
      select: { id: true },
    });
    if (deck === null) return { status: 404, body: { error: 'DECK_NOT_FOUND' } };
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.deckCard.deleteMany({ where: { deckId } });
      return transaction.deck.update({
        where: { id: deckId },
        data: {
          name: input.name,
          cardDataVersion: input.cardDataVersion,
          cards: {
            create: input.cards.map(({ cardVersionId, position, quantity }) => ({
              cardVersionId,
              position,
              quantity,
            })),
          },
        },
        include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
      });
    });
    return { status: 200, body: updated };
  }

  private async deleteDeck(playerId: string, deckId: string): Promise<ApiResponse> {
    const deleted = await this.prisma.deck.deleteMany({ where: { id: deckId, playerId } });
    return deleted.count === 0
      ? { status: 404, body: { error: 'DECK_NOT_FOUND' } }
      : { status: 204, body: null };
  }

  private async startCpuMatch(playerId: string, body: unknown): Promise<ApiResponse> {
    const value = object(body);
    const deckId = string(value.deckId, 'deckId');
    const difficulty = cpuDifficulty(value.difficulty);
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, playerId },
      include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
    });
    if (deck === null) return { status: 404, body: { error: 'DECK_NOT_FOUND' } };
    const totalCards = deck.cards.reduce((total, card) => total + card.quantity, 0);
    if (totalCards !== deckSize)
      throw new BadRequestError(`A CPU match requires exactly ${deckSize} cards.`);
    const cards = deck.cards.flatMap((deckCard) => {
      const definition = toEngineDefinition(deckCard.cardVersion.definition);
      return Array.from({ length: deckCard.quantity }, (_, index) => ({
        id: `${deckCard.cardVersion.cardId}-${String(deckCard.position)}-${String(index)}`,
        definitionId: definition.id,
      }));
    });
    const matchId = randomUUID();
    const cpuId = `cpu:${matchId}`;
    const state = createInitialBattleState({
      matchId: matchId as MatchId,
      engineVersion: '1.0.0',
      rulesVersion: '1.0.0',
      cardDataVersion: deck.cardDataVersion,
      seed: randomUUID(),
      initialDrawCount: 5,
      turnDrawCount: 1,
      players: [
        { id: playerId as PlayerId, drawPile: cards as CardInstance[] },
        {
          id: cpuId as PlayerId,
          drawPile: cards.map((card) => ({ ...card, id: `cpu-${card.id}` })) as CardInstance[],
        },
      ],
    });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.match.create({
        data: {
          id: matchId,
          engineVersion: state.engineVersion,
          rulesVersion: state.rulesVersion,
          cardDataVersion: state.cardDataVersion,
          seed: state.seed,
          initialState: json(state),
          players: { create: { playerId, seat: 1, deckSnapshot: json(deck) } },
        },
      });
      await new PrismaMissionService(this.prisma).recordProgressInTransaction(
        transaction,
        playerId,
        'CPU_BATTLE',
        1,
      );
      await new PrismaProgressionService(this.prisma).grantExperienceInTransaction(transaction, {
        playerId,
        amount: 10,
        reason: 'CPU_MATCH_STARTED',
        idempotencyKey: `match:${matchId}:xp`,
      });
    });
    return { status: 201, body: { id: matchId, difficulty, state } };
  }

  private async getMatch(playerId: string, matchId: string): Promise<ApiResponse> {
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, players: { some: { playerId } } },
      select: { id: true, status: true, initialState: true, finalState: true, createdAt: true },
    });
    return match === null
      ? { status: 404, body: { error: 'MATCH_NOT_FOUND' } }
      : { status: 200, body: match };
  }

  private async validateOwnedDeck(
    playerId: string,
    cardDataVersion: string,
    cards: readonly DeckCardInput[],
  ): Promise<void> {
    if (cardDataVersion !== currentCardDataVersion(this.environment)) {
      throw new BadRequestError('Deck card data version is not the configured snapshot.');
    }
    if (cards.length === 0) throw new BadRequestError('A deck requires cards.');
    if (cards.length > deckSize)
      throw new BadRequestError(`A deck cannot contain more than ${deckSize} card entries.`);
    const ids = cards.map((card) => card.cardVersionId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestError('Each card version may appear once in a deck.');
    const positions = cards.map((card) => card.position);
    if (new Set(positions).size !== positions.length)
      throw new BadRequestError('Deck card positions must be unique non-negative integers.');
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    if (total !== deckSize)
      throw new BadRequestError(`A deck must contain exactly ${deckSize} cards.`);
    const owned = await this.prisma.playerCard.findMany({
      where: { playerId, cardVersionId: { in: ids } },
      include: { cardVersion: { select: { definition: true, version: true } } },
    });
    if (owned.length !== cards.length)
      throw new BadRequestError('Deck contains a card that is not owned.');
    const byId = new Map(owned.map((card) => [card.cardVersionId, card]));
    try {
      validateDeckCards(
        cards.map((card) => {
          const collectionCard = byId.get(card.cardVersionId);
          if (collectionCard === undefined)
            throw new BadRequestError('Deck contains a card that is not owned.');
          if (collectionCard.cardVersion.version !== cardDataVersion) {
            throw new BadRequestError('Deck cards must match the selected card data version.');
          }
          return {
            ...card,
            ownedQuantity: collectionCard.quantity,
            deckLimit: deckLimit(collectionCard.cardVersion.definition),
          };
        }),
      );
    } catch (error) {
      if (error instanceof DeckValidationError) throw new BadRequestError(error.message);
      throw error;
    }
  }

  private async requirePlayer(request: ApiRequest) {
    const playerId = header(request.headers, 'x-deckdrive-player-id');
    if (playerId === undefined || playerId.length === 0) throw new UnauthorizedError();
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (player === null) throw new UnauthorizedError();
    return player;
  }

  private errorResponse(error: unknown): ApiResponse {
    if (error instanceof UnauthorizedError) return { status: 401, body: { error: 'UNAUTHORIZED' } };
    if (error instanceof BadRequestError)
      return { status: 400, body: { error: 'INVALID_REQUEST' } };
    if (error instanceof PackOpeningValidationError)
      return { status: 400, body: { error: 'INVALID_REQUEST' } };
    if (error instanceof InsufficientGemError)
      return { status: 402, body: { error: 'INSUFFICIENT_GEM' } };
    if (error instanceof PackPurchaseLimitError)
      return { status: 409, body: { error: 'PACK_PURCHASE_LIMIT_REACHED' } };
    if (error instanceof IdempotencyConflictError)
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_CONFLICT' } };
    if (error instanceof RewardValidationError)
      return { status: 409, body: { error: 'IDEMPOTENCY_KEY_CONFLICT' } };
    if (error instanceof MissionNotFoundError)
      return { status: 404, body: { error: 'MISSION_NOT_FOUND' } };
    if (error instanceof MissionNotReadyError)
      return { status: 409, body: { error: 'MISSION_NOT_READY' } };
    if (error instanceof PackPoolUnavailableError)
      return { status: 503, body: { error: 'PACK_POOL_UNAVAILABLE' } };
    if (error instanceof DevelopmentAuthenticationDisabledError)
      return { status: 404, body: { error: 'NOT_FOUND' } };
    return { status: 500, body: { error: 'INTERNAL_ERROR' } };
  }
}

class UnauthorizedError extends Error {}
class BadRequestError extends Error {}

function sortVersionedCards<T extends { readonly cardId: string; readonly version: string }>(
  cards: readonly T[],
): T[] {
  return [...cards].sort((left, right) => {
    const cardIdOrder = left.cardId.localeCompare(right.cardId);
    if (cardIdOrder !== 0) return cardIdOrder;
    return compareSemanticVersions(right.version, left.version);
  });
}

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = parseSemanticVersion(left);
  const rightParts = parseSemanticVersion(right);
  if (leftParts === undefined || rightParts === undefined) return left.localeCompare(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseSemanticVersion(version: string): number[] | undefined {
  const parts = version.split('.').map((part) => Number(part));
  return parts.every((part) => Number.isInteger(part) && part >= 0) ? parts : undefined;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new BadRequestError('Request body must be an object.');
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new BadRequestError(`${field} is required.`);
  return value;
}
function header(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}
function deckInput(body: unknown) {
  const value = object(body);
  if (!Array.isArray(value.cards)) throw new BadRequestError('cards must be an array.');
  return {
    name: string(value.name, 'name'),
    cardDataVersion: string(value.cardDataVersion, 'cardDataVersion'),
    cards: value.cards.map((item) => {
      const card = object(item);
      return {
        cardVersionId: string(card.cardVersionId, 'cardVersionId'),
        quantity: integer(card.quantity, 'quantity', 1),
        position: integer(card.position, 'position', 0),
        ownedQuantity: 0,
        deckLimit: null,
      };
    }),
  };
}
function integer(value: unknown, field: string, minimum?: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new BadRequestError(`${field} must be an integer.`);
  if (minimum !== undefined && value < minimum)
    throw new BadRequestError(`${field} must be at least ${minimum}.`);
  return value;
}
function cpuDifficulty(value: unknown): CpuDifficulty {
  if (value === 'EASY' || value === 'NORMAL' || value === 'HARD' || value === 'EXPERT')
    return value;
  throw new BadRequestError('difficulty must be EASY, NORMAL, HARD, or EXPERT.');
}
function currentCardDataVersion(environment: NodeJS.ProcessEnv): string {
  const configured = environment.CARD_DATA_VERSION?.trim();
  return configured === undefined || configured.length === 0 ? '1.0.0' : configured;
}
function deckLimit(value: Prisma.JsonValue): number | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.deckLimit === 'number' &&
    Number.isInteger(value.deckLimit) &&
    value.deckLimit > 0
    ? value.deckLimit
    : null;
}
function toEngineDefinition(value: Prisma.JsonValue): CardDefinition {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof value.id !== 'string' ||
    typeof value.cost !== 'number' ||
    !Array.isArray(value.effects)
  )
    throw new Error('Stored card definition is invalid.');
  return value as unknown as CardDefinition;
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
