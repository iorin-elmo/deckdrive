// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { maximumCardCopies } from '@deck-drive/card-definitions';

import { ApiError, type BattleState, type CardSummary, type Deck, type OwnedCard } from './api.js';
import {
  canOpenOfflinePreview,
  cardDetailHref,
  deckBuilderCardTotal,
  deckBuilderCardsForVersion,
  deckBuilderCopyLimit,
  deckBuilderInput,
  hasOwnedCosmetics,
  isCpuReadyDeck,
  isUnauthorizedApiError,
  loginReturnPath,
  resultTitle,
  selectCardSummary,
  BattleBoard,
} from './app.js';
import { I18nProvider } from './i18n.js';
import { useSessionStore } from './store.js';

describe('BattleBoard participant identity', () => {
  it('renders the second seat as you and displays that seat’s hand', async () => {
    const state: BattleState = {
      matchId: 'match',
      cardDataVersion: '1.0.0',
      turn: 1,
      phase: 'PLAYER_TURN',
      players: [
        {
          id: 'seat-one',
          hp: 30,
          maxHp: 30,
          energy: 3,
          maxEnergy: 3,
          block: 0,
          hand: [{ id: 'seat-one-card', definitionId: 'sword_strike' }],
          statuses: [],
          alchemyStage: 1,
          synthesisCount: 1,
        },
        {
          id: 'seat-two',
          hp: 25,
          maxHp: 30,
          energy: 2,
          maxEnergy: 3,
          block: 1,
          hand: [{ id: 'seat-two-card', definitionId: 'sword_strike' }],
          statuses: [],
          alchemyStage: 2,
          synthesisCount: 3,
        },
      ],
    };
    useSessionStore.getState().setPlayerId('seat-two');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const queryClient = new QueryClient();
    queryClient.setQueryData(['cards', false], []);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              MemoryRouter,
              null,
              createElement(I18nProvider, null, createElement(BattleBoard, { state })),
            ),
          ),
        ),
      );
      const html = container.innerHTML;
      expect(html.indexOf('seat-one')).toBeLessThan(html.indexOf('seat-two'));
      expect(html).toContain('seat-two-card');
      expect(html).not.toContain('seat-one-card');
      expect(container.querySelector('.combatant-player')?.textContent).toContain('seat-two');
      expect(container.querySelector('.combatant-player')?.textContent).toContain('2/3');
    } finally {
      await act(async () => root.unmount());
      useSessionStore.getState().clearPlayerId();
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    }
  });
});

const cards: readonly CardSummary[] = [
  {
    cardId: 'sword_strike',
    version: '1.0.0',
    definition: {
      id: 'sword_strike',
      version: '1.0.0',
      name: 'Strike',
      class: 'SWORD',
      rarity: 'COMMON',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal damage.',
      effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }],
      keywords: [],
      artwork: null,
      deckLimit: 3,
    },
  },
  {
    cardId: 'sword_strike',
    version: '1.1.0',
    definition: {
      id: 'sword_strike',
      version: '1.1.0',
      name: 'Strike+',
      class: 'SWORD',
      rarity: 'COMMON',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal a bit more damage.',
      effects: [{ type: 'DAMAGE', amount: 7, target: 'ENEMY' }],
      keywords: [],
      artwork: null,
      deckLimit: 3,
    },
  },
];

describe('cardDetailHref', () => {
  it('includes the selected card version in the detail location', () => {
    expect(cardDetailHref(cards[1]!)).toBe('/cards/sword_strike?version=1.1.0');
  });
});

describe('selectCardSummary', () => {
  it('resolves a versioned card selection from the detail route', () => {
    expect(selectCardSummary(cards, 'sword_strike', '1.1.0')).toMatchObject({
      version: '1.1.0',
      definition: { name: 'Strike+' },
    });
  });

  it('falls back to the first matching card for legacy routes without a version', () => {
    expect(selectCardSummary(cards, 'sword_strike', null)).toMatchObject({
      version: '1.0.0',
    });
  });
});

describe('canOpenOfflinePreview', () => {
  it('only enables the fallback for unavailable or failed services', () => {
    expect(canOpenOfflinePreview(new ApiError(0, 'API_UNAVAILABLE'))).toBe(true);
    expect(canOpenOfflinePreview(new ApiError(500, 'INTERNAL_ERROR'))).toBe(true);
    expect(canOpenOfflinePreview(new ApiError(400, 'INVALID_REQUEST'))).toBe(false);
    expect(canOpenOfflinePreview(new ApiError(404, 'NOT_FOUND'))).toBe(false);
  });
});

describe('isCpuReadyDeck', () => {
  const deck = (quantity: number): Deck => ({
    id: 'deck-1',
    name: 'Deck',
    cardDataVersion: '1.0.0',
    cards: [
      {
        cardVersionId: 'card-1',
        position: 0,
        quantity,
        cardVersion: cards[0]!,
      },
    ],
  });

  it('only allows complete 30-card decks into CPU practice', () => {
    expect(isCpuReadyDeck(deck(30))).toBe(true);
    expect(isCpuReadyDeck(deck(2))).toBe(false);
  });
});

describe('hasOwnedCosmetics', () => {
  it('uses ownership state rather than catalog size for an empty cosmetics state', () => {
    expect(hasOwnedCosmetics([{ acquiredAt: null }, { acquiredAt: null }])).toBe(false);
    expect(hasOwnedCosmetics([{ acquiredAt: '2026-09-25T00:00:00.000Z' }])).toBe(true);
  });
});

describe('deckBuilderInput', () => {
  const collection: readonly OwnedCard[] = [
    { cardVersionId: 'version-1', quantity: 3, cardVersion: cards[0]! },
    {
      cardVersionId: 'version-2',
      quantity: 2,
      cardVersion: {
        ...cards[1]!,
        definition: { ...cards[1]!.definition, deckLimit: 2 },
      },
    },
  ];

  it('limits copies and builds contiguous API positions from selected cards', () => {
    expect(deckBuilderCopyLimit(collection[0]!)).toBe(maximumCardCopies);
    expect(deckBuilderCopyLimit(collection[1]!)).toBe(2);
    const input = deckBuilderInput(' Practice ', '1.0.0', collection, {
      'version-1': 3,
      'version-2': 2,
    });

    expect(input).toEqual({
      name: 'Practice',
      cardDataVersion: '1.0.0',
      cards: [
        { cardVersionId: 'version-1', quantity: 3, position: 0 },
        { cardVersionId: 'version-2', quantity: 2, position: 1 },
      ],
    });
    expect(deckBuilderCardTotal({ 'version-1': 3, 'version-2': 2 })).toBe(5);
  });
});

describe('deckBuilderCardsForVersion', () => {
  it('uses only cards from the collection-provided data version', () => {
    const collection: readonly OwnedCard[] = [
      { cardVersionId: 'version-1', quantity: 3, cardVersion: cards[0]! },
      { cardVersionId: 'version-2', quantity: 3, cardVersion: cards[1]! },
    ];

    expect(deckBuilderCardsForVersion(collection, '1.1.0')).toEqual([collection[1]]);
    expect(deckBuilderCardsForVersion(collection, undefined)).toEqual([]);
  });
});

describe('isUnauthorizedApiError', () => {
  it('identifies expired player sessions without treating other failures as unauthenticated', () => {
    expect(isUnauthorizedApiError(new ApiError(401, 'UNAUTHORIZED'))).toBe(true);
    expect(isUnauthorizedApiError(new ApiError(500, 'INTERNAL_ERROR'))).toBe(false);
  });
});

describe('loginReturnPath', () => {
  it.each(['\n', '\r', '\t', '\u0000', '\u007f'])('rejects control characters: %j', (control) => {
    expect(loginReturnPath('/' + control + '//evil.example')).toBe('/home');
  });
  it('preserves a local destination and rejects external return paths', () => {
    expect(loginReturnPath('/cards?version=1.0.0')).toBe('/cards?version=1.0.0');
    expect(loginReturnPath('//example.test')).toBe('/home');
    expect(loginReturnPath('/\\example.test')).toBe('/home');
    expect(loginReturnPath(null)).toBe('/home');
  });
});

describe('resultTitle', () => {
  it('uses the persisted match status for result headings', () => {
    expect(resultTitle('COMPLETED')).toBe('Battle complete');
    expect(resultTitle('ABANDONED')).toBe('Battle abandoned');
    expect(resultTitle('IN_PROGRESS')).toBe('Battle in progress');
  });
});
