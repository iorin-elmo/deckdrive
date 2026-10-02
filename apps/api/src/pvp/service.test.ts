import { describe, expect, it, vi } from 'vitest';

import { PvpMatchService } from './service.js';

describe('PvpMatchService', () => {
  it('shares concurrent private invite creation for the same request ID', async () => {
    const deckId = '00000000-0000-4000-8000-000000000001';
    const findFirst = vi.fn().mockResolvedValue({
      id: deckId,
      cardDataVersion: '1.0.0',
      cards: [
        {
          position: 0,
          quantity: 30,
          cardVersion: {
            definition: { id: 'strike', cost: 1, effects: [] },
          },
        },
      ],
    });
    const service = new PvpMatchService({
      deck: { findFirst },
    } as never);

    const results = await Promise.all([
      service.createPrivate('player-1', deckId, 'request-1'),
      service.createPrivate('player-1', deckId, 'request-1'),
    ]);

    expect(results[0]?.inviteCode).toBe(results[1]?.inviteCode);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});
