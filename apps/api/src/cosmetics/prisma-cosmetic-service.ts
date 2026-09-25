import type { PrismaClient } from '../generated/prisma/client.js';

type CosmeticOperations = Pick<PrismaClient, 'cosmetic' | 'cosmeticGrant' | 'playerCosmetic'>;
type CosmeticClient = CosmeticOperations & Pick<PrismaClient, '$transaction'>;

export interface CosmeticGrant {
  readonly playerId: string;
  readonly cosmeticId: string;
  readonly source: string;
  readonly idempotencyKey: string;
}

/** Idempotently grants presentation-only cosmetics; this service never touches battle state. */
export class PrismaCosmeticService {
  constructor(private readonly prisma: CosmeticClient) {}

  async grant(grant: CosmeticGrant) {
    validateGrant(grant);
    return this.prisma.$transaction((transaction) => this.grantInTransaction(transaction, grant));
  }

  /** Allows a reward claim and cosmetic ownership to commit in one transaction. */
  async grantInTransaction(transaction: CosmeticOperations, grant: CosmeticGrant) {
    validateGrant(grant);
    const cosmetic = await transaction.cosmetic.findUnique({ where: { id: grant.cosmeticId } });
    if (cosmetic === null) throw new Error('Cosmetic was not found.');
    const recordedGrant = await transaction.cosmeticGrant.upsert({
      where: {
        playerId_idempotencyKey: {
          playerId: grant.playerId,
          idempotencyKey: grant.idempotencyKey,
        },
      },
      update: {},
      create: grant,
    });
    if (recordedGrant.cosmeticId !== grant.cosmeticId || recordedGrant.source !== grant.source)
      throw new Error('Idempotency key was already used for a different cosmetic grant.');
    return transaction.playerCosmetic.upsert({
      where: {
        playerId_cosmeticId: { playerId: grant.playerId, cosmeticId: grant.cosmeticId },
      },
      update: {},
      create: grant,
    });
  }
}

function validateGrant(grant: CosmeticGrant): void {
  if (grant.playerId.trim().length === 0) throw new Error('A player ID is required.');
  if (grant.cosmeticId.trim().length === 0) throw new Error('A cosmetic ID is required.');
  if (grant.source.trim().length === 0) throw new Error('A cosmetic source is required.');
  if (grant.idempotencyKey.trim().length === 0) throw new Error('An idempotency key is required.');
}
