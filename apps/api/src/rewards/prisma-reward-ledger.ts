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
export class PrismaRewardLedger implements RewardLedgerRepository, RewardLedgerOperations {
  constructor(private readonly prisma: LedgerOperationsClient) {}

  async transaction<Result>(
    operation: (ledger: RewardLedgerOperations) => Promise<Result>,
  ): Promise<Result> {
    return (this.prisma as LedgerClient).$transaction((transaction) =>
      operation(new PrismaRewardLedger(transaction)),
    );
  }

  async findOrInsert(grant: RewardGrant): Promise<RewardLedgerEntry> {
    return this.toEntry(
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

  private toEntry(
    entry: Awaited<ReturnType<LedgerClient['currencyTransaction']['upsert']>>,
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
}
