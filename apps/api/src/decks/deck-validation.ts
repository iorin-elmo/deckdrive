export const deckSize = 30;
export const defaultCardCopyLimit = 3;

export interface DeckCardInput {
  readonly cardVersionId: string;
  readonly quantity: number;
  readonly position: number;
  readonly ownedQuantity: number;
  readonly deckLimit: number | null;
}

export class DeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeckValidationError';
  }
}

/** Validates only data supplied by the server's collection lookup. */
export function validateDeckCards(cards: readonly DeckCardInput[]): void {
  if (cards.length === 0) throw new DeckValidationError('A deck requires cards.');
  if (cards.length > deckSize) {
    throw new DeckValidationError(`A deck cannot contain more than ${deckSize} card entries.`);
  }
  const positions = new Set<number>();
  let total = 0;
  for (const card of cards) {
    if (!Number.isInteger(card.position) || card.position < 0 || positions.has(card.position)) {
      throw new DeckValidationError('Deck card positions must be unique non-negative integers.');
    }
    positions.add(card.position);
    if (!Number.isInteger(card.quantity) || card.quantity < 1) {
      throw new DeckValidationError('Deck card quantities must be positive integers.');
    }
    const limit = Math.min(card.deckLimit ?? defaultCardCopyLimit, defaultCardCopyLimit);
    if (card.quantity > limit) {
      throw new DeckValidationError(`Card ${card.cardVersionId} exceeds its deck copy limit.`);
    }
    if (card.quantity > card.ownedQuantity) {
      throw new DeckValidationError(`Card ${card.cardVersionId} is not owned in that quantity.`);
    }
    total += card.quantity;
  }
  if (total !== deckSize)
    throw new DeckValidationError(`A deck must contain exactly ${deckSize} cards.`);
}
