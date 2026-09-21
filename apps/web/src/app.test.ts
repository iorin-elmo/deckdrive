import { describe, expect, it } from 'vitest';

import { ApiError, type CardSummary, type Deck } from './api.js';
import {
  canOpenOfflinePreview,
  cardDetailHref,
  isCpuReadyDeck,
  loginReturnPath,
  resultTitle,
  selectCardSummary,
} from './app.js';

const cards: readonly CardSummary[] = [
  {
    cardId: 'sword_strike',
    version: '1.0.0',
    definition: {
      id: 'sword_strike',
      name: 'Strike',
      class: 'FIGHTER',
      rarity: 'COMMON',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal damage.',
      keywords: [],
    },
  },
  {
    cardId: 'sword_strike',
    version: '1.1.0',
    definition: {
      id: 'sword_strike',
      name: 'Strike+',
      class: 'FIGHTER',
      rarity: 'COMMON',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal a bit more damage.',
      keywords: [],
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

describe('loginReturnPath', () => {
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
