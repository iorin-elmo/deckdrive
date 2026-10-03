import { describe, expect, it, vi } from 'vitest';

import { ApiApplication } from '../api/application.js';
import { PrismaFeatureFlags, featureFlagDefaults } from './feature-flags.js';

describe('PrismaFeatureFlags', () => {
  it('uses safe defaults and a persisted override', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ enabled: false });
    const flags = new PrismaFeatureFlags({ featureFlag: { findUnique } } as never, 'development');
    await expect(flags.enabled('ENABLE_RANKED')).resolves.toBe(true);
    await expect(flags.enabled('ENABLE_RANKED')).resolves.toBe(false);
    expect(featureFlagDefaults.MAINTENANCE_MODE).toBe(false);
  });

  it('cannot enable debug in production even if the database says yes', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const flags = new PrismaFeatureFlags({ featureFlag: { findUnique } } as never, 'production');
    await expect(flags.enabled('ENABLE_DEBUG')).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('fails closed when the environment is missing or unknown', async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    for (const environment of [undefined, 'preview', 'test']) {
      const flags = new PrismaFeatureFlags({ featureFlag: { findUnique } } as never, environment);
      await expect(flags.enabled('ENABLE_DEBUG')).resolves.toBe(false);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('feature flag API gates', () => {
  it('applies N00 private-match and maintenance gates to complete-pool battles', async () => {
    let maintenance = false;
    const findUnique = vi.fn().mockImplementation(({ where }: { where: { name: string } }) => ({
      enabled:
        where.name === 'MAINTENANCE_MODE' ? maintenance : where.name !== 'ENABLE_PRIVATE_MATCH',
    }));
    const app = new ApiApplication({ featureFlag: { findUnique } } as never);
    for (const request of [
      { method: 'POST', path: '/api/v1/alpha-battles', body: { mode: 'PRIVATE' }, headers: {} },
      { method: 'POST', path: '/api/v1/alpha-battles/join/AABBCCDDEEFF', headers: {} },
    ])
      expect(await app.handle(request)).toEqual({
        status: 503,
        body: { error: 'FEATURE_DISABLED' },
      });
    maintenance = true;
    expect(
      await app.handle({ method: 'GET', path: '/api/v1/alpha-battles/active', headers: {} }),
    ).toEqual({ status: 503, body: { error: 'MAINTENANCE_MODE' } });
  });
  it('blocks ranked requests when disabled and keeps authentication reachable during maintenance', async () => {
    const findUnique = vi.fn().mockImplementation(({ where }: { where: { name: string } }) => {
      if (where.name === 'MAINTENANCE_MODE') return { enabled: false };
      if (where.name === 'ENABLE_RANKED') return { enabled: false };
      return null;
    });
    const application = new ApiApplication({ featureFlag: { findUnique } } as never);
    await expect(
      application.handle({ method: 'GET', path: '/api/v1/ranked/profile', headers: {} }),
    ).resolves.toEqual({ status: 503, body: { error: 'FEATURE_DISABLED' } });
    await expect(
      application.handle({
        method: 'DELETE',
        path: '/api/v1/matches/ranked/queue/old',
        headers: {},
      }),
    ).resolves.toEqual({ status: 401, body: { error: 'UNAUTHORIZED' } });

    findUnique.mockResolvedValue({ enabled: true });
    await expect(
      application.handle({ method: 'GET', path: '/api/v1/cards', headers: {} }),
    ).resolves.toEqual({ status: 503, body: { error: 'MAINTENANCE_MODE' } });
    await expect(
      application.handle({ method: 'GET', path: '/api/v1/auth/session', headers: {} }),
    ).resolves.toEqual({ status: 401, body: { error: 'UNAUTHORIZED' } });
  });

  it('removes disabled rare products from the catalogue', async () => {
    const findUnique = vi
      .fn()
      .mockImplementation(({ where }: { where: { name: string } }) =>
        where.name === 'ENABLE_RARE_PACK' ? { enabled: false } : null,
      );
    const application = new ApiApplication(
      {
        featureFlag: { findUnique },
        player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      } as never,
      { NODE_ENV: 'development' },
    );
    const response = await application.handle({
      method: 'GET',
      path: '/api/v1/packs',
      headers: { 'x-deckdrive-player-id': 'player-1' },
    });
    expect(response.status).toBe(200);
    expect(
      (response.body as { products: { id: string }[] }).products.map((product) => product.id),
    ).toEqual(['NORMAL_PACK', 'BOX', 'WEEKLY_BOX']);
  });
});
