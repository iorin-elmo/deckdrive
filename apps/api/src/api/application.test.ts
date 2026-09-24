import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { ApiApplication } from './application.js';

describe('ApiApplication authentication', () => {
  it('sorts listCards responses by numeric semantic version for the same card', async () => {
    const application = new ApiApplication({
      cardVersion: {
        findMany: vi.fn().mockResolvedValue([
          { cardId: 'sword_strike', version: '1.2.0', definition: { id: 'older' } },
          { cardId: 'sword_strike', version: '1.10.0', definition: { id: 'newer' } },
        ]),
      },
    } as unknown as PrismaClient);

    const response = await application.handle({
      method: 'GET',
      path: '/api/v1/cards',
      headers: {},
    });

    expect(response).toMatchObject({
      status: 200,
      body: {
        cards: [
          { cardId: 'sword_strike', version: '1.10.0' },
          { cardId: 'sword_strike', version: '1.2.0' },
        ],
      },
    });
  });

  it('returns the numerically latest card version for card detail requests', async () => {
    const application = new ApiApplication({
      cardVersion: {
        findMany: vi.fn().mockResolvedValue([
          { cardId: 'sword_strike', version: '1.2.0', definition: { id: 'older' } },
          { cardId: 'sword_strike', version: '1.10.0', definition: { id: 'newer' } },
        ]),
      },
    } as unknown as PrismaClient);

    const response = await application.handle({
      method: 'GET',
      path: '/api/v1/cards/sword_strike',
      headers: {},
    });

    expect(response).toMatchObject({
      status: 200,
      body: { cardId: 'sword_strike', version: '1.10.0', definition: { id: 'newer' } },
    });
  });

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

  it('reports login-claim state for the current UTC day only', async () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const findUnique = vi.fn().mockResolvedValue(null);
    const application = new ApiApplication({
      player: {
        findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ experience: 100, level: 1 }),
      },
      loginRewardClaim: { findUnique },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/progression',
        headers: { 'x-deckdrive-player-id': 'player-1' },
      }),
    ).resolves.toMatchObject({ status: 200, body: { loginClaimedToday: false } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { playerId_day: { playerId: 'player-1', day: today } },
    });
  });

  it('returns only the authenticated player mission progress for the current server period', async () => {
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      mission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'daily.cpu-battle',
            cadence: 'DAILY',
            metric: 'CPU_BATTLE',
            target: 1,
            rewardCurrency: 'GEM',
            rewardAmount: 20,
          },
        ]),
      },
      playerMission: {
        findMany: vi.fn().mockResolvedValue([
          {
            playerId: 'player-1',
            missionId: 'daily.cpu-battle',
            periodStart,
            progress: 1,
            claimedAt: null,
          },
        ]),
      },
    } as unknown as PrismaClient);

    const response = await application.handle({
      method: 'GET',
      path: '/api/v1/missions',
      headers: { 'x-deckdrive-player-id': 'player-1' },
    });

    expect(response).toMatchObject({
      status: 200,
      body: { missions: [{ id: 'daily.cpu-battle', progress: 1 }] },
    });
  });

  it('returns only the authenticated player collection with card version IDs', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        cardVersionId: 'version-1',
        quantity: 3,
        cardVersion: {
          cardId: 'sword_strike',
          version: '1.0.0',
          definition: { id: 'sword_strike' },
        },
      },
    ]);
    const application = new ApiApplication(
      {
        player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
        playerCard: { findMany },
      } as unknown as PrismaClient,
      { CARD_DATA_VERSION: '1.2.0' },
    );

    await expect(
      application.handle({
        method: 'GET',
        path: '/api/v1/collection',
        headers: { 'x-deckdrive-player-id': 'player-1' },
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        cardDataVersion: '1.2.0',
        cards: [
          {
            cardVersionId: 'version-1',
            quantity: 3,
            cardVersion: { cardId: 'sword_strike', version: '1.0.0' },
          },
        ],
      },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { playerId: 'player-1' },
      orderBy: { updatedAt: 'asc' },
      include: { cardVersion: true },
    });
  });

  it('does not expose unexpected infrastructure errors as client errors', async () => {
    const application = new ApiApplication({
      cardVersion: { findMany: vi.fn().mockRejectedValue(new Error('database connection secret')) },
    } as unknown as PrismaClient);

    await expect(
      application.handle({ method: 'GET', path: '/api/v1/cards', headers: {} }),
    ).resolves.toEqual({ status: 500, body: { error: 'INTERNAL_ERROR' } });
  });

  it('returns not found before authenticating an unsupported route', async () => {
    const findUnique = vi.fn();
    const application = new ApiApplication({
      player: { findUnique },
    } as unknown as PrismaClient);

    await expect(
      application.handle({ method: 'POST', path: '/api/v1/cards', headers: {} }),
    ).resolves.toEqual({ status: 404, body: { error: 'NOT_FOUND' } });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects oversized decks before querying the player collection', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      playerCard: { findMany },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: {
          name: 'Oversized',
          cardDataVersion: '1.0.0',
          cards: Array.from({ length: 31 }, (_, position) => ({
            cardVersionId: `card-${String(position)}`,
            quantity: 1,
            position,
          })),
        },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects empty decks before querying the player collection', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      playerCard: { findMany },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: { name: 'Empty', cardDataVersion: '1.0.0', cards: [] },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a deck that does not use the configured card data snapshot', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication(
      {
        player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
        playerCard: { findMany },
      } as unknown as PrismaClient,
      { CARD_DATA_VERSION: '1.0.0' },
    );

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: {
          name: 'Wrong snapshot',
          cardDataVersion: '9.9.9',
          cards: Array.from({ length: 10 }, (_, position) => ({
            cardVersionId: `card-${String(position)}`,
            quantity: 3,
            position,
          })),
        },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects cards whose versions differ from the selected snapshot', async () => {
    const findMany = vi.fn().mockResolvedValue(
      Array.from({ length: 10 }, (_, position) => ({
        cardVersionId: `card-${String(position)}`,
        quantity: 3,
        cardVersion: { version: '0.9.0', definition: { deckLimit: 3 } },
      })),
    );
    const application = new ApiApplication(
      {
        player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
        playerCard: { findMany },
      } as unknown as PrismaClient,
      { CARD_DATA_VERSION: '1.0.0' },
    );

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: {
          name: 'Mixed snapshot',
          cardDataVersion: '1.0.0',
          cards: Array.from({ length: 10 }, (_, position) => ({
            cardVersionId: `card-${String(position)}`,
            quantity: 3,
            position,
          })),
        },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).toHaveBeenCalledOnce();
  });

  it('rejects invalid quantities and positions before querying the player collection', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      playerCard: { findMany },
    } as unknown as PrismaClient);

    for (const card of [
      { quantity: 0, position: 0 },
      { quantity: -1, position: 0 },
      { quantity: 1, position: -1 },
    ]) {
      await expect(
        application.handle({
          method: 'POST',
          path: '/api/v1/decks',
          headers: { 'x-deckdrive-player-id': 'player-1' },
          body: {
            name: 'Invalid',
            cardDataVersion: '1.0.0',
            cards: [{ cardVersionId: 'card-1', ...card }],
          },
        }),
      ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects duplicate positions before querying the player collection', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      playerCard: { findMany },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: {
          name: 'Duplicate positions',
          cardDataVersion: '1.0.0',
          cards: [
            { cardVersionId: 'card-1', quantity: 1, position: 0 },
            { cardVersionId: 'card-2', quantity: 1, position: 0 },
          ],
        },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects decks with an invalid card total before querying the player collection', async () => {
    const findMany = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      playerCard: { findMany },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/decks',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: {
          name: 'Invalid total',
          cardDataVersion: '1.0.0',
          cards: [{ cardVersionId: 'card-1', quantity: 1, position: 0 }],
        },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(findMany).not.toHaveBeenCalled();
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

  it('uses the stored CardDefinition ID when creating CPU card instances', async () => {
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      deck: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'deck-1',
          cardDataVersion: '1.0.0',
          cards: [
            {
              quantity: 30,
              position: 0,
              cardVersion: {
                cardId: 'database-card-id',
                definition: {
                  id: 'engine-definition-id',
                  cost: 1,
                  effects: [{ type: 'DAMAGE', amount: 1, target: 'ENEMY' }],
                },
              },
            },
          ],
        }),
      },
      $transaction: vi.fn((operation) =>
        operation({
          match: { create: vi.fn() },
          mission: { findMany: vi.fn().mockResolvedValue([]) },
          playerMission: { findUnique: vi.fn(), upsert: vi.fn() },
        }),
      ),
    } as unknown as PrismaClient);

    const response = await application.handle({
      method: 'POST',
      path: '/api/v1/matches',
      headers: { 'x-deckdrive-player-id': 'player-1' },
      body: { deckId: 'deck-1', difficulty: 'EASY' },
    });

    expect(response.status).toBe(201);
    const state = (response.body as { state: { players: { hand: unknown[] }[] } }).state;
    expect(state.players[0]?.hand[0]).toMatchObject({ definitionId: 'engine-definition-id' });
  });

  it('rejects an incomplete deck before creating a CPU match', async () => {
    const create = vi.fn();
    const application = new ApiApplication({
      player: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1' }) },
      deck: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'deck-1',
          cardDataVersion: '1.0.0',
          cards: [{ quantity: 2 }],
        }),
      },
      match: { create },
    } as unknown as PrismaClient);

    await expect(
      application.handle({
        method: 'POST',
        path: '/api/v1/matches',
        headers: { 'x-deckdrive-player-id': 'player-1' },
        body: { deckId: 'deck-1', difficulty: 'EASY' },
      }),
    ).resolves.toEqual({ status: 400, body: { error: 'INVALID_REQUEST' } });
    expect(create).not.toHaveBeenCalled();
  });
});
