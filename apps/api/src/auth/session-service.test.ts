import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { sha256 } from './crypto.js';
import { PrismaSessionService } from './session-service.js';

const now = new Date('2026-09-27T00:00:00.000Z');
const validSession = {
  id: 'session-1',
  userId: 'user-1',
  csrfTokenHash: sha256('csrf-token'),
  expiresAt: new Date('2026-09-28T00:00:00.000Z'),
  revokedAt: null,
  user: { player: { id: 'player-1' } },
};

describe('PrismaSessionService', () => {
  it('accepts a valid session and validates its CSRF token', async () => {
    const service = new PrismaSessionService(
      {
        session: { findUnique: vi.fn().mockResolvedValue(validSession) },
      } as unknown as PrismaClient,
      () => now,
    );

    const session = await service.authenticate('session-token');

    expect(session).toMatchObject({ sessionId: 'session-1', playerId: 'player-1' });
    if (session === undefined) throw new Error('Expected an authenticated session.');
    expect(service.verifiesCsrf(session, 'csrf-token')).toBe(true);
    expect(service.verifiesCsrf(session, 'incorrect')).toBe(false);
  });

  it.each([
    { ...validSession, revokedAt: now },
    { ...validSession, expiresAt: new Date('2026-09-26T23:59:59.000Z') },
  ])('rejects revoked and expired sessions', async (storedSession) => {
    const service = new PrismaSessionService(
      {
        session: { findUnique: vi.fn().mockResolvedValue(storedSession) },
      } as unknown as PrismaClient,
      () => now,
    );

    await expect(service.authenticate('session-token')).resolves.toBeUndefined();
  });

  it('revokes an opaque token by its hash', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new PrismaSessionService(
      { session: { updateMany } } as unknown as PrismaClient,
      () => now,
    );

    await service.revoke('session-token');

    expect(updateMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('session-token'), revokedAt: null },
      data: { revokedAt: now },
    });
  });
});
