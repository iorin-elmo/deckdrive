import { describe, expect, it } from 'vitest';

import { ApiError, type CardSummary } from './api.js';
import { canOpenOfflinePreview, cardDetailHref, selectCardSummary } from './app.js';

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
