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

  it('cleans stale rows before creating a session and rotates CSRF tokens by hash', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new PrismaSessionService(
      { session: { deleteMany, create, updateMany } } as unknown as PrismaClient,
      () => now,
    );

    await service.create('user-1');
    const csrfToken = await service.rotateCsrfToken('session-1');

    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-1' }) });
    expect(csrfToken).toEqual(expect.any(String));
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'session-1', revokedAt: null }),
      data: { csrfTokenHash: sha256(csrfToken!) },
    });
  });
});
