import { describe, expect, it } from 'vitest';

import { calculateCardGrants, generatePackOpening } from './pack-opening.js';

const pool = [
  { id: 'n', rarity: 'N' },
  { id: 'r', rarity: 'R' },
  { id: 'sr', rarity: 'SR' },
  { id: 'ssr', rarity: 'SSR' },
  { id: 'ur', rarity: 'UR' },
] as const;

describe('generatePackOpening', () => {
  it('composes the monthly bundle at the regular box price', () => {
    const opening = generatePackOpening({ productId: 'MONTHLY_BUNDLE', seed: 'monthly', pool });

    expect(opening.product.gemCost).toBe(1000);
    expect(opening.results.map((result) => result.product)).toEqual(['BOX', 'RARE_PACK']);
    expect(opening.cards).toHaveLength(55);
  });
});

describe('calculateCardGrants', () => {
  it('keeps at most three copies and converts each excess card', () => {
    const grants = calculateCardGrants(
      [
        { id: 'owned', rarity: 'UR' },
        { id: 'owned', rarity: 'UR' },
        { id: 'new', rarity: 'R' },
        { id: 'new', rarity: 'R' },
        { id: 'new', rarity: 'R' },
        { id: 'new', rarity: 'R' },
      ],
      new Map([['owned', 2]]),
    );

    expect(grants).toEqual([
      { cardVersionId: 'owned', granted: 2, retained: 1, converted: 1, exchangePoints: 500 },
      { cardVersionId: 'new', granted: 4, retained: 3, converted: 1, exchangePoints: 15 },
    ]);
  });
});
