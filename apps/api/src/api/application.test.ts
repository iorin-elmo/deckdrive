import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { ApiApplication } from './application.js';

describe('ApiApplication authentication', () => {
  it('accepts the player header with any casing', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'player-1' });
    const application = new ApiApplication({
      player: {
        findUnique,
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'player-1',
          user: { displayName: 'Player' },
        }),
      },
      currencyTransaction: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/me',
        headers: { 'X-Deckdrive-Player-Id': 'player-1' },
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'player-1' }, select: { id: true } });
  });

  it('does not expose unexpected infrastructure errors as client errors', async () => {
    const application = new ApiApplication({
      cardVersion: { findMany: vi.fn().mockRejectedValue(new Error('database connection secret')) },
    } as unknown as PrismaClient);

    await expect(
      application.handle({ method: 'GET', path: '/api/v1/cards', headers: {} }),
    ).resolves.toEqual({ status: 500, body: { error: 'INTERNAL_ERROR' } });
  });

  it('hides development authentication in production', async () => {
    const application = new ApiApplication({} as PrismaClient, { NODE_ENV: 'production' });

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/auth/development',
        headers: {},
        body: {},
      }),
    ).resolves.toEqual({ status: 404, body: { error: 'NOT_FOUND' } });
  });
});
