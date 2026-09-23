import { afterEach, describe, expect, it, vi } from 'vitest';

import { basicCardDefinitions, maximumCardCopies } from '@deck-drive/card-definitions';

import { ApiError, DeckDriveApi, previewApi } from './api.js';

describe('DeckDriveApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the versioned cards endpoint without a player header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cards: [
            {
              cardId: 'sword_strike',
              version: '1.0.0',
              definition: { id: 'sword_strike', name: 'Strike' },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const cards = await new DeckDriveApi('https://api.example.test').cards();

    expect(cards[0]).toMatchObject({ cardId: 'sword_strike' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/cards',
      expect.objectContaining({ method: 'GET', headers: {} }),
    );
  });

  it('normalizes a trailing slash in the configured API origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cards: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await new DeckDriveApi('https://api.example.test/').cards();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/cards',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends the player header and body for a CPU match request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'match-1', difficulty: 'NORMAL', state: {} }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new DeckDriveApi().startCpuMatch('player-1', 'deck-1', 'NORMAL');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/matches',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-Deckdrive-Player-Id': 'player-1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ deckId: 'deck-1', difficulty: 'NORMAL' }),
      }),
    );
  });

  it('reads the collection and sends a deck builder payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cardDataVersion: '1.0.0',
            cards: [
              {
                cardVersionId: 'version-1',
                quantity: 3,
                cardVersion: { cardId: 'sword_strike', version: '1.0.0', definition: {} },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'deck-1', name: 'Practice', cards: [] }), {
          status: 201,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new DeckDriveApi();

    await expect(client.collection('player-1')).resolves.toMatchObject({
      cardDataVersion: '1.0.0',
      cards: [{ cardVersionId: 'version-1' }],
    });
    await client.createDeck('player-1', {
      name: 'Practice',
      cardDataVersion: '1.0.0',
      cards: [{ cardVersionId: 'version-1', quantity: 3, position: 0 }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/collection',
      expect.objectContaining({ headers: { 'X-Deckdrive-Player-Id': 'player-1' } }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/decks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Practice',
          cardDataVersion: '1.0.0',
          cards: [{ cardVersionId: 'version-1', quantity: 3, position: 0 }],
        }),
      }),
    );
  });

  it('converts API error bodies into a non-leaking client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
        ),
    );

    await expect(new DeckDriveApi().me('unknown-player')).rejects.toEqual(
      new ApiError(401, 'UNAUTHORIZED'),
    );
  });

  it('identifies an unavailable API without exposing a transport error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')));

    await expect(new DeckDriveApi().cards()).rejects.toEqual(new ApiError(0, 'API_UNAVAILABLE'));
  });

  it('provides a local fixture only when offline preview is selected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const decks = await previewApi.decks('preview-player');
    const collection = await previewApi.collection('preview-player');
    const deck = decks[0];
    expect(deck).toBeDefined();
    if (deck === undefined) throw new Error('Expected the preview deck');

    const match = await previewApi.startCpuMatch('preview-player', deck.id, 'NORMAL');
    const persistedMatch = await previewApi.match('preview-player', match.id);

    expect(deck).toMatchObject({ id: 'preview-starter-deck' });
    expect(collection).toMatchObject({ cardDataVersion: '1.0.0' });
    expect(collection.cards).toHaveLength(basicCardDefinitions.length);
    expect(await previewApi.cards()).toEqual(
      basicCardDefinitions.map((definition) => ({
        cardId: definition.id,
        version: definition.version,
        definition,
      })),
    );
    expect(deck.cards.reduce((total, card) => total + card.quantity, 0)).toBe(30);
    expect(
      deck.cards.every(
        (card) => card.quantity <= (card.cardVersion.definition.deckLimit ?? maximumCardCopies),
      ),
    ).toBe(true);
    expect(
      deck.cards.every((card) => {
        const owned = collection.cards.find(
          (candidate) => candidate.cardVersionId === card.cardVersionId,
        );
        return owned !== undefined && card.quantity <= owned.quantity;
      }),
    ).toBe(true);
    expect(match).toMatchObject({ id: 'preview-cpu-match', difficulty: 'NORMAL' });
    expect(persistedMatch).toMatchObject({
      status: 'IN_PROGRESS',
      initialState: { matchId: 'preview-cpu-match' },
      finalState: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
