import { describe, expect, it, vi } from 'vitest';

import { AdminOperationError, PrismaAdminService, maskEmail } from './service.js';

const command = {
  action: 'GRANT_CURRENCY' as const,
  playerId: '00000000-0000-0000-0000-000000000001',
  currency: 'GEM' as const,
  amount: 100,
  reason: 'Support correction',
  requestId: 'same-request',
};

describe('PrismaAdminService', () => {
  it('pages audit records without dropping the continuation cursor', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ id: `audit-${index}` }));
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = new PrismaAdminService({ adminAction: { findMany } } as never);
    const first = await service.audit();
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toBe('audit-99');
    const cursor = '00000000-0000-0000-0000-000000000001';
    await service.audit(cursor);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: cursor },
        skip: 1,
        take: 101,
      }),
    );
  });
  it('records a currency grant and its audit snapshot in one transaction', async () => {
    const createGrant = vi.fn().mockResolvedValue({});
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      adminAction: { findUnique: vi.fn().mockResolvedValue(null), create: createAudit },
      player: { findUnique: vi.fn().mockResolvedValue({ id: command.playerId }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: command.playerId }]),
      currencyTransaction: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 50 } }),
        create: createGrant,
      },
    };
    const $transaction = vi.fn().mockImplementation((operation) => operation(transaction));
    const service = new PrismaAdminService({ $transaction } as never);

    await expect(service.execute('admin-user', command)).resolves.toEqual({
      id: 'audit-1',
      before: { balance: 50 },
      after: { balance: 150 },
      replayed: false,
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(createGrant).toHaveBeenCalledTimes(1);
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-user',
        requestId: 'same-request',
        action: 'GRANT_CURRENCY',
        before: { balance: 50 },
        after: { balance: 150 },
      }),
    });
  });

  it('audits the effective default before the first flag override', async () => {
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-flag' });
    const transaction = {
      adminAction: { findUnique: vi.fn().mockResolvedValue(null), create: createAudit },
      featureFlag: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new PrismaAdminService({
      $transaction: vi.fn().mockImplementation((operation) => operation(transaction)),
    } as never);

    await expect(
      service.execute('admin-user', {
        action: 'SET_FLAG',
        name: 'ENABLE_RANKED',
        enabled: false,
        reason: 'Suspend ranked queue',
        requestId: 'ranked-off',
      }),
    ).resolves.toMatchObject({
      before: { enabled: true },
      after: { enabled: false },
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { enabled: true },
        after: { enabled: false },
      }),
    });
  });

  it('replays the same request and rejects a different payload for that key', async () => {
    const recorded = {
      id: 'audit-1',
      payloadHash: 'not-the-current-payload',
      before: { balance: 50 },
      after: { balance: 150 },
    };
    const transaction = { adminAction: { findUnique: vi.fn().mockResolvedValue(recorded) } };
    const service = new PrismaAdminService({
      $transaction: vi.fn().mockImplementation((operation) => operation(transaction)),
    } as never);
    await expect(service.execute('admin-user', command)).rejects.toMatchObject({
      code: 'ADMIN_REQUEST_CONFLICT',
      status: 409,
    } satisfies Partial<AdminOperationError>);
  });
});

describe('maskEmail', () => {
  it('does not disclose the local part of a player email in admin search results', () => {
    expect(maskEmail('alice@example.test')).toBe('a***@example.test');
    expect(maskEmail(null)).toBeNull();
  });
});
