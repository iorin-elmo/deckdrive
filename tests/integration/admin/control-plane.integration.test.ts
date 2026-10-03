import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient } from '../../../apps/api/src/generated/prisma/client.js';
import { PrismaAdminService } from '../../../apps/api/src/admin/service.js';
import { adminRoleForUser, discordOwnerId } from '../../../apps/api/src/admin/identity.js';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for admin integration tests.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

describe('N00 administrator persistence', () => {
  let adminUserId = '';
  let createdAdmin = false;
  let playerUserId = '';
  let playerId = '';
  const requestId = randomUUID();

  beforeAll(async () => {
    const existing = await prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'DISCORD', providerUserId: discordOwnerId } },
      select: { userId: true },
    });
    if (existing === null) {
      const admin = await prisma.user.create({
        data: {
          displayName: 'N00 admin',
          oauthAccounts: { create: { provider: 'DISCORD', providerUserId: discordOwnerId } },
        },
      });
      adminUserId = admin.id;
      createdAdmin = true;
    } else adminUserId = existing.userId;
    const player = await prisma.user.create({
      data: {
        displayName: 'N00 player',
        player: { create: {} },
        oauthAccounts: { create: { provider: 'DISCORD', providerUserId: `test-${randomUUID()}` } },
      },
      include: { player: true },
    });
    playerUserId = player.id;
    playerId = player.player!.id;
  });

  afterAll(async () => {
    await prisma.adminAction.deleteMany({ where: { adminUserId, requestId } });
    await prisma.currencyTransaction.deleteMany({ where: { playerId } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: playerUserId } });
    if (createdAdmin) await prisma.oAuthAccount.deleteMany({ where: { userId: adminUserId } });
    await prisma.player.deleteMany({ where: { id: playerId } });
    await prisma.user.deleteMany({ where: { id: playerUserId } });
    if (createdAdmin) await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  it('recognizes only the specified Discord ID', async () => {
    await expect(adminRoleForUser(prisma, adminUserId)).resolves.toBe('OWNER');
    await expect(adminRoleForUser(prisma, playerUserId)).resolves.toBeNull();
  });

  it('commits a grant and audit once across retries and rejects a conflicting payload', async () => {
    const service = new PrismaAdminService(prisma, { NODE_ENV: 'test' });
    const command = {
      action: 'GRANT_CURRENCY' as const,
      playerId,
      currency: 'GEM' as const,
      amount: 30,
      reason: 'Integration verification',
      requestId,
    };
    const first = await service.execute(adminUserId, command);
    const repeat = await service.execute(adminUserId, command);
    expect(repeat).toEqual({ ...first, replayed: true });
    await expect(service.execute(adminUserId, { ...command, amount: 31 })).rejects.toMatchObject({
      code: 'ADMIN_REQUEST_CONFLICT',
      status: 409,
    });
    const [ledger, audit] = await Promise.all([
      prisma.currencyTransaction.findMany({ where: { playerId } }),
      prisma.adminAction.findMany({ where: { adminUserId, requestId } }),
    ]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.amount).toBe(30);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toEqual({ balance: 0 });
    expect(audit[0]?.after).toEqual({ balance: 30 });
  });

  it('never enables debug operations in production', async () => {
    const service = new PrismaAdminService(prisma, { NODE_ENV: 'production' });
    await expect(
      service.execute(adminUserId, {
        action: 'SET_GEM',
        playerId,
        value: 10,
        reason: 'Must fail',
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'DEBUG_DISABLED',
      status: 409,
    });
  });
});
