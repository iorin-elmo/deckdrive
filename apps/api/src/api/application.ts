import { randomUUID } from 'node:crypto';

import { createInitialBattleState } from '@deck-drive/game-engine';
import type { CardDefinition, CardInstance, MatchId, PlayerId } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { assertDevelopmentAuthentication } from '../auth/development-auth.js';
import type { CpuDifficulty } from '../cpu/strategy.js';
import { validateDeckCards, type DeckCardInput } from '../decks/deck-validation.js';

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
        return this.developmentLogin(request.body);
      }
      if (request.method === 'GET' && path === '/api/v1/cards') return this.listCards();
      const cardId = path.match(/^\/api\/v1\/cards\/([^/]+)$/u)?.[1];
      if (request.method === 'GET' && cardId !== undefined) return this.getCard(cardId);

      const player = await this.requirePlayer(request);
      if (request.method === 'GET' && path === '/api/v1/me') return this.me(player.id);
      if (request.method === 'GET' && path === '/api/v1/decks') return this.listDecks(player.id);
      if (request.method === 'POST' && path === '/api/v1/decks')
        return this.createDeck(player.id, request.body);
      const deckId = path.match(/^\/api\/v1\/decks\/([^/]+)$/u)?.[1];
      if (deckId !== undefined && request.method === 'PUT')
        return this.updateDeck(player.id, deckId, request.body);
      if (deckId !== undefined && request.method === 'DELETE')
        return this.deleteDeck(player.id, deckId);
      if (request.method === 'POST' && path === '/api/v1/matches')
        return this.startCpuMatch(player.id, request.body);
      const matchId = path.match(/^\/api\/v1\/matches\/([^/]+)$/u)?.[1];
      if (matchId !== undefined && request.method === 'GET')
        return this.getMatch(player.id, matchId);
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
    const cards = await this.prisma.cardVersion.findMany({
      orderBy: [{ cardId: 'asc' }, { version: 'desc' }],
      select: { cardId: true, version: true, definition: true },
    });
    return { status: 200, body: { cards } };
  }

  private async getCard(cardId: string): Promise<ApiResponse> {
    const card = await this.prisma.cardVersion.findFirst({
      where: { cardId },
      orderBy: { version: 'desc' },
      select: { cardId: true, version: true, definition: true },
    });
    return card === null
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

  private async createDeck(playerId: string, body: unknown): Promise<ApiResponse> {
    const input = deckInput(body);
    await this.validateOwnedDeck(playerId, input.cards);
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
      include: { cards: { orderBy: { position: 'asc' } } },
    });
    return { status: 201, body: deck };
  }

  private async updateDeck(playerId: string, deckId: string, body: unknown): Promise<ApiResponse> {
    const input = deckInput(body);
    await this.validateOwnedDeck(playerId, input.cards);
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
        include: { cards: { orderBy: { position: 'asc' } } },
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
    const cards = deck.cards.flatMap((deckCard) =>
      Array.from({ length: deckCard.quantity }, (_, index) => ({
        id: `${deckCard.cardVersion.cardId}-${String(deckCard.position)}-${String(index)}`,
        definitionId: deckCard.cardVersion.cardId,
      })),
    );
    deck.cards.forEach((deckCard) => toEngineDefinition(deckCard.cardVersion.definition));
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
    await this.prisma.match.create({
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
    cards: readonly DeckCardInput[],
  ): Promise<void> {
    const ids = cards.map((card) => card.cardVersionId);
    if (new Set(ids).size !== ids.length)
      throw new Error('Each card version may appear once in a deck.');
    const owned = await this.prisma.playerCard.findMany({
      where: { playerId, cardVersionId: { in: ids } },
      include: { cardVersion: { select: { definition: true } } },
    });
    if (owned.length !== cards.length) throw new Error('Deck contains a card that is not owned.');
    const byId = new Map(owned.map((card) => [card.cardVersionId, card]));
    validateDeckCards(
      cards.map((card) => {
        const collectionCard = byId.get(card.cardVersionId);
        if (collectionCard === undefined)
          throw new Error('Deck contains a card that is not owned.');
        return {
          ...card,
          ownedQuantity: collectionCard.quantity,
          deckLimit: deckLimit(collectionCard.cardVersion.definition),
        };
      }),
    );
  }

  private async requirePlayer(request: ApiRequest) {
    const playerId = request.headers['x-deckdrive-player-id'];
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
    if (error instanceof Error)
      return { status: 400, body: { error: 'INVALID_REQUEST', message: error.message } };
    return { status: 500, body: { error: 'INTERNAL_ERROR' } };
  }
}

class UnauthorizedError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Request body must be an object.');
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${field} is required.`);
  return value;
}
function deckInput(body: unknown) {
  const value = object(body);
  if (!Array.isArray(value.cards)) throw new Error('cards must be an array.');
  return {
    name: string(value.name, 'name'),
    cardDataVersion: string(value.cardDataVersion, 'cardDataVersion'),
    cards: value.cards.map((item) => {
      const card = object(item);
      return {
        cardVersionId: string(card.cardVersionId, 'cardVersionId'),
        quantity: integer(card.quantity, 'quantity'),
        position: integer(card.position, 'position'),
        ownedQuantity: 0,
        deckLimit: null,
      };
    }),
  };
}
function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    throw new Error(`${field} must be an integer.`);
  return value;
}
function cpuDifficulty(value: unknown): CpuDifficulty {
  if (value === 'EASY' || value === 'NORMAL' || value === 'HARD' || value === 'EXPERT')
    return value;
  throw new Error('difficulty must be EASY, NORMAL, HARD, or EXPERT.');
}
function deckLimit(value: Prisma.JsonValue): number | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.deckLimit === 'number'
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
