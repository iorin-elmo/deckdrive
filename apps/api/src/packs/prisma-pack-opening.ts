import { randomUUID } from 'node:crypto';

import type { PackCard, PackRarity } from '@deck-drive/pack-engine';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  calculateCardGrants,
  generatePackOpening,
  type ApiPackProduct,
  type CardGrant,
  type GeneratedPackOpening,
  PackOpeningValidationError,
} from './pack-opening.js';

export interface OpenPackRequest {
  readonly playerId: string;
  readonly productId: ApiPackProduct;
  readonly idempotencyKey: string;
  readonly seed?: string;
}

export interface OpenPackResult {
  readonly openingId: string;
  readonly productId: ApiPackProduct;
  readonly gemCost: number;
  readonly cards: readonly PackCard[];
  readonly grants: readonly CardGrant[];
  readonly exchangePoints: number;
}

export class InsufficientGemError extends Error {
  constructor() {
    super('Insufficient Gems.');
    this.name = 'InsufficientGemError';
  }
}

export class PackPurchaseLimitError extends Error {
  constructor() {
    super('This limited pack has already been purchased for the current period.');
    this.name = 'PackPurchaseLimitError';
  }
}

export class PackPoolUnavailableError extends Error {
  constructor() {
    super('The current card data does not provide a valid pack pool.');
    this.name = 'PackPoolUnavailableError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different pack product.');
    this.name = 'IdempotencyConflictError';
  }
}

export type PackOpeningOperations = Pick<
  PrismaClient,
  '$queryRaw' | 'packOpening' | 'cardVersion' | 'currencyTransaction' | 'playerCard'
>;
type PackOpeningClient = Pick<PrismaClient, '$transaction'>;

interface PackOpeningOptions {
  readonly chargeGems: boolean;
  readonly enforcePurchaseLimit: boolean;
}

/**
 * Owns the Phase 6 database transaction.  The player row lock serializes balance
 * checks, purchases and duplicate conversion for a single player.
 */
export class PrismaPackOpeningService {
  constructor(private readonly prisma: PackOpeningClient) {}

  async open(request: OpenPackRequest): Promise<OpenPackResult> {
    validateRequest(request);
    if (request.idempotencyKey.startsWith(serverRewardIdempotencyPrefix))
      throw new PackOpeningValidationError(
        'Client idempotency keys may not use the server prefix.',
      );
    const seed = request.seed ?? randomUUID();
    return this.prisma.$transaction(
      (transaction) =>
        this.openInTransaction(
          transaction,
          { ...request, seed },
          { chargeGems: true, enforcePurchaseLimit: true },
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /** Grants a pack without charging currency; callers must own the surrounding transaction lock. */
  async grantInTransaction(
    transaction: PackOpeningOperations,
    request: OpenPackRequest,
  ): Promise<OpenPackResult> {
    validateRequest(request);
    return this.openInTransaction(
      transaction,
      { ...request, seed: request.seed ?? randomUUID() },
      { chargeGems: false, enforcePurchaseLimit: false },
    );
  }

  private async openInTransaction(
    transaction: PackOpeningOperations,
    request: OpenPackRequest,
    options: PackOpeningOptions,
  ): Promise<OpenPackResult> {
    const seed = request.seed ?? randomUUID();
    const lockedPlayers = await transaction.$queryRaw<readonly { id: string }[]>(Prisma.sql`
      SELECT "id" FROM "players" WHERE "id" = ${request.playerId}::uuid FOR UPDATE
    `);
    if (lockedPlayers.length === 0) throw new Error('Player not found.');

    const existing = await transaction.packOpening.findUnique({
      where: {
        playerId_idempotencyKey: {
          playerId: request.playerId,
          idempotencyKey: request.idempotencyKey,
        },
      },
    });
    if (existing !== null) {
      if (existing.product !== request.productId) {
        throw new IdempotencyConflictError();
      }
      return existing.result as unknown as OpenPackResult;
    }

    const cards = await transaction.cardVersion.findMany({
      select: { id: true, definition: true },
      orderBy: { id: 'asc' },
    });
    const pool = cards.flatMap((card): PackCard[] => {
      const rarity = packRarity(card.definition);
      return rarity === undefined ? [] : [{ id: card.id, rarity }];
    });

    let generated: GeneratedPackOpening;
    try {
      generated = generatePackOpening({
        productId: request.productId,
        seed,
        pool,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'PackPoolError')
        throw new PackPoolUnavailableError();
      throw error;
    }

    if (options.enforcePurchaseLimit && generated.product.limit !== null) {
      const purchases = await transaction.packOpening.count({
        where: {
          playerId: request.playerId,
          product: request.productId,
          createdAt: { gte: periodStart(generated.product.limit.period) },
        },
      });
      if (purchases >= generated.product.limit.maximum) throw new PackPurchaseLimitError();
    }

    if (options.chargeGems) {
      const balance = await transaction.currencyTransaction.aggregate({
        where: { playerId: request.playerId, currency: 'GEM' },
        _sum: { amount: true },
      });
      if ((balance._sum.amount ?? 0) < generated.product.gemCost) throw new InsufficientGemError();
    }

    const cardIds = [...new Set(generated.cards.map((card) => card.id))];
    const owned = await transaction.playerCard.findMany({
      where: { playerId: request.playerId, cardVersionId: { in: cardIds } },
      select: { cardVersionId: true, quantity: true },
    });
    const grants = calculateCardGrants(
      generated.cards,
      new Map(owned.map((card) => [card.cardVersionId, card.quantity])),
    );
    const exchangePoints = grants.reduce((sum, grant) => sum + grant.exchangePoints, 0);

    const result: OpenPackResult = {
      openingId: '',
      productId: request.productId,
      gemCost: options.chargeGems ? generated.product.gemCost : 0,
      cards: generated.cards,
      grants,
      exchangePoints,
    };
    const opening = await transaction.packOpening.create({
      data: {
        playerId: request.playerId,
        product: request.productId,
        gemCost: options.chargeGems ? generated.product.gemCost : 0,
        seed,
        result: toJson(result),
        idempotencyKey: request.idempotencyKey,
      },
    });
    const persistedResult = { ...result, openingId: opening.id };
    await transaction.packOpening.update({
      where: { id: opening.id },
      data: { result: toJson(persistedResult) },
    });
    if (options.chargeGems) {
      await transaction.currencyTransaction.create({
        data: {
          playerId: request.playerId,
          currency: 'GEM',
          amount: -generated.product.gemCost,
          reason: 'PACK_OPEN',
          referenceId: opening.id,
          idempotencyKey: `pack:${opening.id}:gem`,
        },
      });
    }
    for (const grant of grants) {
      if (grant.retained === 0) continue;
      await transaction.playerCard.upsert({
        where: {
          playerId_cardVersionId: {
            playerId: request.playerId,
            cardVersionId: grant.cardVersionId,
          },
        },
        update: { quantity: { increment: grant.retained } },
        create: {
          playerId: request.playerId,
          cardVersionId: grant.cardVersionId,
          quantity: grant.retained,
        },
      });
    }
    if (exchangePoints > 0) {
      await transaction.currencyTransaction.create({
        data: {
          playerId: request.playerId,
          currency: 'EXCHANGE_POINT',
          amount: exchangePoints,
          reason: 'DUPLICATE_CONVERSION',
          referenceId: opening.id,
          idempotencyKey: `pack:${opening.id}:duplicates`,
        },
      });
    }
    return persistedResult;
  }
}

function validateRequest(request: OpenPackRequest): void {
  if (request.playerId.trim().length === 0) throw new Error('A player ID is required.');
  if (request.idempotencyKey.trim().length === 0)
    throw new Error('An idempotency key is required.');
}

/** Client-supplied keys may never overlap reserved, server-generated reward keys. */
export const serverRewardIdempotencyPrefix = 'server:';

function packRarity(definition: Prisma.JsonValue): PackRarity | undefined {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition))
    return undefined;
  switch (definition.rarity) {
    case 'N':
    case 'R':
    case 'SR':
    case 'SSR':
    case 'UR':
      return definition.rarity;
    default:
      return undefined;
  }
}

function periodStart(period: 'WEEK' | 'MONTH'): Date {
  const now = new Date();
  if (period === 'MONTH') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
