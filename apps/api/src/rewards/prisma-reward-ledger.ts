import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  RewardGrant,
  RewardLedgerEntry,
  RewardLedgerOperations,
  RewardLedgerRepository,
} from './reward-ledger.js';

type LedgerClient = Pick<PrismaClient, 'currencyTransaction' | '$transaction'>;

/** Prisma adapter; callers own the service-level transaction boundary. */
export class PrismaRewardLedger implements RewardLedgerRepository, RewardLedgerOperations {
  constructor(private readonly prisma: LedgerClient) {}

  async transaction<Result>(
    operation: (ledger: RewardLedgerOperations) => Promise<Result>,
  ): Promise<Result> {
    return this.prisma.$transaction((transaction) =>
      operation(new PrismaRewardLedger(transaction)),
    );
  }

  async findByIdempotencyKey(
    playerId: string,
    idempotencyKey: string,
  ): Promise<RewardLedgerEntry | null> {
    return this.toEntry(
      await this.prisma.currencyTransaction.findUnique({
        where: { playerId_idempotencyKey: { playerId, idempotencyKey } },
      }),
    );
  }

  async insert(grant: RewardGrant): Promise<RewardLedgerEntry> {
    return this.toEntry(await this.prisma.currencyTransaction.create({ data: grant }))!;
  }

  private toEntry(entry: Awaited<ReturnType<LedgerClient['currencyTransaction']['findUnique']>>) {
    return entry === null
      ? null
      : {
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
