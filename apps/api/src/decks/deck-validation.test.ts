import { describe, expect, it } from 'vitest';

import { DeckValidationError, validateDeckCards } from './deck-validation.js';

const validCards = Array.from({ length: 10 }, (_, position) => ({
  cardVersionId: `card-${String(position)}`,
  quantity: 3,
  position,
  ownedQuantity: 3,
  deckLimit: 3,
}));

describe('validateDeckCards', () => {
  it('accepts a 30-card owned collection with copy limits', () => {
    expect(() => validateDeckCards(validCards)).not.toThrow();
  });

  it('rejects client-supplied quantities that exceed the collection', () => {
    expect(() => validateDeckCards([{ ...validCards[0]!, quantity: 3, ownedQuantity: 2 }])).toThrow(
      DeckValidationError,
    );
  });

  it('rejects a deck that is not exactly 30 cards', () => {
    expect(() => validateDeckCards(validCards.slice(0, 9))).toThrow('exactly 30');
  });

  it('rejects more than 30 entries before applying per-card validation', () => {
    const excessiveEntries = Array.from({ length: 31 }, (_, position) => ({
      cardVersionId: `card-${String(position)}`,
      quantity: 0,
      position,
      ownedQuantity: 0,
      deckLimit: 0,
    }));
    expect(() => validateDeckCards(excessiveEntries)).toThrow('more than 30');
  });
});
