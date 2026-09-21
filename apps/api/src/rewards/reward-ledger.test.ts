import { describe, expect, it } from 'vitest';

import {
  RewardService,
  type RewardGrant,
  type RewardLedgerEntry,
  type RewardLedgerOperations,
} from './reward-ledger.js';

class InMemoryLedger {
  readonly entries: RewardLedgerEntry[] = [];
  async transaction<Result>(
    operation: (ledger: RewardLedgerOperations) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
  async findByIdempotencyKey(playerId: string, key: string) {
    return (
      this.entries.find((entry) => entry.playerId === playerId && entry.idempotencyKey === key) ??
      null
    );
  }
  async insert(grant: RewardGrant): Promise<RewardLedgerEntry> {
    const entry = { ...grant, id: String(this.entries.length + 1), createdAt: new Date(0) };
    this.entries.push(entry);
    return entry;
  }
}

describe('RewardService', () => {
  it('writes one ledger entry when a grant is retried', async () => {
    const ledger = new InMemoryLedger();
    const service = new RewardService(ledger);
    const grant = {
      playerId: 'player',
      currency: 'GEM' as const,
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
    };
    await expect(service.grant(grant)).resolves.toMatchObject({ id: '1' });
    await expect(service.grant(grant)).resolves.toMatchObject({ id: '1' });
    expect(ledger.entries).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key for a changed reward', async () => {
    const service = new RewardService(new InMemoryLedger());
    await service.grant({
      playerId: 'player',
      currency: 'GEM',
      amount: 10,
      reason: 'CPU_MATCH_WIN',
      idempotencyKey: 'match:1:reward',
    });
    await expect(
      service.grant({
        playerId: 'player',
        currency: 'GEM',
        amount: 11,
        reason: 'CPU_MATCH_WIN',
        idempotencyKey: 'match:1:reward',
      }),
    ).rejects.toThrow('different reward');
  });

  it('rejects a concurrent idempotency winner with a different payload', async () => {
    const ledger = new InMemoryLedger();
    const service = new RewardService(ledger);
    ledger.findByIdempotencyKey = async () => null;
    ledger.insert = async (grant) => ({
      ...grant,
      amount: 11,
      id: 'concurrent-entry',
      createdAt: new Date(0),
    });
    await expect(
      service.grant({
        playerId: 'player',
        currency: 'GEM',
        amount: 10,
        reason: 'CPU_MATCH_WIN',
        idempotencyKey: 'match:1:reward',
      }),
    ).rejects.toThrow('different reward');
  });
});
