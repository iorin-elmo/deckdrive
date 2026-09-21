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
});
