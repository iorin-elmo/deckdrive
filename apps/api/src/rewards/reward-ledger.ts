export type RewardCurrency = 'GEM' | 'EXCHANGE_POINT';

export interface RewardGrant {
  readonly playerId: string;
  readonly currency: RewardCurrency;
  readonly amount: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface RewardLedgerEntry extends RewardGrant {
  readonly id: string;
  readonly createdAt: Date;
}

export interface RewardLedgerRepository {
  transaction<Result>(
    operation: (ledger: RewardLedgerOperations) => Promise<Result>,
  ): Promise<Result>;
}

export interface RewardLedgerOperations {
  findByIdempotencyKey(playerId: string, idempotencyKey: string): Promise<RewardLedgerEntry | null>;
  insert(grant: RewardGrant): Promise<RewardLedgerEntry>;
}

export class RewardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RewardValidationError';
  }
}

/** Idempotent, append-only grants shared by future pack and mission flows. */
export class RewardService {
  constructor(private readonly ledger: RewardLedgerRepository) {}

  async grant(grant: RewardGrant): Promise<RewardLedgerEntry> {
    validateGrant(grant);
    return this.ledger.transaction(async (ledger) => {
      const existing = await ledger.findByIdempotencyKey(grant.playerId, grant.idempotencyKey);
      if (existing !== null) {
        if (
          existing.currency !== grant.currency ||
          existing.amount !== grant.amount ||
          existing.reason !== grant.reason
        ) {
          throw new RewardValidationError(
            'Idempotency key was already used for a different reward.',
          );
        }
        return existing;
      }
      return ledger.insert(grant);
    });
  }
}

function validateGrant(grant: RewardGrant): void {
  if (!Number.isInteger(grant.amount) || grant.amount <= 0) {
    throw new RewardValidationError('Reward amounts must be positive integers.');
  }
  if (grant.reason.trim().length === 0)
    throw new RewardValidationError('A reward reason is required.');
  if (grant.idempotencyKey.trim().length === 0) {
    throw new RewardValidationError('An idempotency key is required.');
  }
}
