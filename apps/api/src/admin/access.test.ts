import { describe, expect, it, vi } from 'vitest';

import { ApiApplication } from '../api/application.js';
import { sha256 } from '../auth/crypto.js';
import { discordOwnerId } from './identity.js';

const session = {
  id: 'session-id',
  userId: 'user-id',
  csrfTokenHash: sha256('csrf'),
  expiresAt: new Date('2099-01-01'),
  revokedAt: null,
  authProvider: 'DISCORD',
  user: { player: { id: 'player-id' } },
};

describe('admin access', () => {
  it('does not grant Admin collection privileges to a session created before N00', async () => {
    const findUnique = vi.fn();
    const application = new ApiApplication(
      {
        session: { findUnique: vi.fn().mockResolvedValue({ ...session, authProvider: null }) },
        oAuthAccount: { findUnique },
        playerCard: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      { NODE_ENV: 'production' },
    );
    expect(
      await application.handle({
        method: 'GET',
        path: '/api/v1/collection',
        headers: { cookie: 'deckdrive_session=token' },
      }),
    ).toMatchObject({ status: 200, body: { cards: [] } });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('does not accept the development player header as administrator authentication', async () => {
    const application = new ApiApplication({} as never, { NODE_ENV: 'development' });
    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/admin/session',
        headers: { 'x-deckdrive-player-id': 'player-id' },
      }),
    ).resolves.toEqual({ status: 401, body: { error: 'UNAUTHORIZED' } });
  });

  it('rejects another Discord identity after a valid login', async () => {
    const application = new ApiApplication(
      {
        session: { findUnique: vi.fn().mockResolvedValue(session) },
        oAuthAccount: { findUnique: vi.fn().mockResolvedValue({ providerUserId: 'not-owner' }) },
      } as never,
      { NODE_ENV: 'development' },
    );
    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/admin/session',
        headers: { cookie: 'deckdrive_session=token' },
      }),
    ).resolves.toEqual({ status: 403, body: { error: 'ADMIN_FORBIDDEN' } });
  });

  it('rejects a development session even when its user has the owner Discord account', async () => {
    const findUnique = vi.fn().mockResolvedValue({ providerUserId: discordOwnerId });
    const application = new ApiApplication(
      {
        session: { findUnique: vi.fn().mockResolvedValue({ ...session, authProvider: null }) },
        oAuthAccount: { findUnique },
      } as never,
      { NODE_ENV: 'development' },
    );
    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/admin/session',
        headers: { cookie: 'deckdrive_session=token' },
      }),
    ).resolves.toEqual({
      status: 403,
      body: { error: 'ADMIN_FORBIDDEN' },
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('grants the allowed Discord identity only after session authentication', async () => {
    const application = new ApiApplication(
      {
        session: { findUnique: vi.fn().mockResolvedValue(session) },
        oAuthAccount: { findUnique: vi.fn().mockResolvedValue({ providerUserId: discordOwnerId }) },
      } as never,
      { NODE_ENV: 'development' },
    );
    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/admin/session',
        headers: { cookie: 'deckdrive_session=token' },
      }),
    ).resolves.toEqual({ status: 200, body: { role: 'OWNER' } });
  });

  it('rejects a mutation without the session CSRF token', async () => {
    const application = new ApiApplication(
      {
        session: { findUnique: vi.fn().mockResolvedValue(session) },
        oAuthAccount: { findUnique: vi.fn().mockResolvedValue({ providerUserId: discordOwnerId }) },
      } as never,
      { NODE_ENV: 'development' },
    );
    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/admin/actions',
        headers: { cookie: 'deckdrive_session=token' },
        body: {
          action: 'SET_FLAG',
          name: 'MAINTENANCE_MODE',
          enabled: true,
          reason: 'Test',
          requestId: 'test-1',
        },
      }),
    ).resolves.toEqual({
      status: 403,
      body: { error: 'CSRF_VALIDATION_FAILED' },
    });
  });
});
