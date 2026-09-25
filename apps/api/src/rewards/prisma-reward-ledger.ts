import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  RewardGrant,
  RewardLedgerEntry,
  RewardLedgerOperations,
  RewardLedgerRepository,
} from './reward-ledger.js';

type LedgerOperationsClient = Pick<PrismaClient, 'currencyTransaction'>;
type LedgerClient = LedgerOperationsClient & Pick<PrismaClient, '$transaction'>;

/** Prisma adapter; callers own the service-level transaction boundary. */
export class PrismaRewardLedger implements RewardLedgerRepository {
  constructor(private readonly prisma: LedgerClient) {}

  async transaction<Result>(
    operation: (ledger: RewardLedgerOperations) => Promise<Result>,
  ): Promise<Result> {
    return this.prisma.$transaction((transaction) =>
      operation(new PrismaRewardLedgerOperations(transaction)),
    );
  }
}

/** Operation-only adapter for callers that already hold a Prisma transaction. */
export class PrismaRewardLedgerOperations implements RewardLedgerOperations {
  constructor(private readonly prisma: LedgerOperationsClient) {}

  async findOrInsert(grant: RewardGrant): Promise<RewardLedgerEntry> {
    return toEntry(
      await this.prisma.currencyTransaction.upsert({
        where: {
          playerId_idempotencyKey: {
            playerId: grant.playerId,
            idempotencyKey: grant.idempotencyKey,
          },
        },
        update: {},
        create: grant,
      }),
    );
  }
}

function toEntry(
  entry: Awaited<ReturnType<LedgerOperationsClient['currencyTransaction']['upsert']>>,
): RewardLedgerEntry {
  return {
    id: entry.id,
    playerId: entry.playerId,
    currency: entry.currency,
    amount: entry.amount,
    reason: entry.reason,
    idempotencyKey: entry.idempotencyKey,
    createdAt: entry.createdAt,
  };
}
