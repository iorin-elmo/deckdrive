import { afterEach, describe, expect, it, vi } from 'vitest';

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
    const deck = decks[0];
    expect(deck).toBeDefined();
    if (deck === undefined) throw new Error('Expected the preview deck');

    const match = await previewApi.startCpuMatch('preview-player', deck.id, 'NORMAL');

    expect(deck).toMatchObject({ id: 'preview-starter-deck' });
    expect(match).toMatchObject({ id: 'preview-cpu-match', difficulty: 'NORMAL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
