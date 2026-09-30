import type { PrismaClient } from '../generated/prisma/client.js';
import { addExperience } from './progression.js';

type ProgressionOperations = Pick<PrismaClient, 'player' | 'experienceTransaction' | '$queryRaw'>;
type ProgressionClient = ProgressionOperations & Pick<PrismaClient, '$transaction'>;

export interface ExperienceGrant {
  readonly playerId: string;
  readonly amount: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/** Locks a player before writing per-player child records in an authoritative transaction. */
export async function lockPlayerForUpdate(
  transaction: Pick<PrismaClient, '$queryRaw'>,
  playerId: string,
): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "players" WHERE "id" = ${playerId}::uuid FOR UPDATE`;
}

/** Idempotent, server-only XP grants. Level is presentation/progression data, never game-engine input. */
export class PrismaProgressionService {
  constructor(private readonly prisma: ProgressionClient) {}

  async grantExperience(grant: ExperienceGrant) {
    validateExperienceGrant(grant);
    return this.prisma.$transaction((transaction) =>
      this.grantExperienceInTransaction(transaction, grant),
    );
  }

  /** Allows an authoritative match event and its XP grant to commit atomically. */
  async grantExperienceInTransaction(transaction: ProgressionOperations, grant: ExperienceGrant) {
    validateExperienceGrant(grant);
    // Lock before the ledger insert: that insert takes a foreign-key KEY SHARE lock,
    // which must never be acquired before another transaction's FOR UPDATE lock.
    await lockPlayerForUpdate(transaction, grant.playerId);
    const inserted = await transaction.experienceTransaction.createMany({
      data: grant,
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const existing = await transaction.experienceTransaction.findUniqueOrThrow({
        where: {
          playerId_idempotencyKey: {
            playerId: grant.playerId,
            idempotencyKey: grant.idempotencyKey,
          },
        },
      });
      if (existing.amount !== grant.amount || existing.reason !== grant.reason)
        throw new Error('Idempotency key was already used for a different experience grant.');
      return transaction.player.findUniqueOrThrow({
        where: { id: grant.playerId },
        select: { experience: true, level: true },
      });
    }
    // Different idempotency keys are serialized before read/level-calculation/write.
    const current = await transaction.player.findUniqueOrThrow({
      where: { id: grant.playerId },
      select: { experience: true, level: true },
    });
    const next = addExperience(current, grant.amount);
    return transaction.player.update({
      where: { id: grant.playerId },
      data: next,
      select: { experience: true, level: true },
    });
  }
}

function validateExperienceGrant(grant: ExperienceGrant): void {
  if (grant.playerId.trim().length === 0) throw new Error('A player ID is required.');
  if (!Number.isInteger(grant.amount) || grant.amount <= 0)
    throw new Error('Experience amount must be a positive integer.');
  if (grant.reason.trim().length === 0) throw new Error('An experience reason is required.');
  if (grant.idempotencyKey.trim().length === 0) throw new Error('An idempotency key is required.');
}
