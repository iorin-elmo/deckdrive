import {
  openPack,
  type OpenedBox,
  type OpenedPack,
  type PackCard,
  type PackProduct,
} from '@deck-drive/pack-engine';

export type ApiPackProduct = PackProduct | 'WEEKLY_BOX' | 'MONTHLY_BUNDLE';

export interface PackProductDefinition {
  readonly id: ApiPackProduct;
  readonly gemCost: number;
  readonly openingProducts: readonly PackProduct[];
  readonly limit: { readonly period: 'WEEK' | 'MONTH'; readonly maximum: number } | null;
}

/** Published server-side catalogue. Prices are intentionally fixed until an admin catalogue exists. */
export const packProducts: readonly PackProductDefinition[] = [
  { id: 'NORMAL_PACK', gemCost: 100, openingProducts: ['NORMAL_PACK'], limit: null },
  { id: 'RARE_PACK', gemCost: 500, openingProducts: ['RARE_PACK'], limit: null },
  { id: 'BOX', gemCost: 1000, openingProducts: ['BOX'], limit: null },
  {
    id: 'WEEKLY_BOX',
    gemCost: 900,
    openingProducts: ['BOX'],
    limit: { period: 'WEEK', maximum: 1 },
  },
  {
    id: 'MONTHLY_BUNDLE',
    gemCost: 1000,
    openingProducts: ['BOX', 'RARE_PACK'],
    limit: { period: 'MONTH', maximum: 1 },
  },
];

export interface PackOpeningInput {
  readonly productId: string;
  readonly seed: string;
  readonly pool: readonly PackCard[];
}

export interface GeneratedPackOpening {
  readonly product: PackProductDefinition;
  readonly results: readonly (OpenedPack | OpenedBox)[];
  readonly cards: readonly PackCard[];
}

export class PackOpeningValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackOpeningValidationError';
  }
}

/** Pure opening composition; persistence, balance and idempotency stay at the API boundary. */
export function generatePackOpening(input: PackOpeningInput): GeneratedPackOpening {
  const product = packProducts.find((candidate) => candidate.id === input.productId);
  if (product === undefined) throw new PackOpeningValidationError('Unknown pack product.');
  if (input.seed.trim().length === 0)
    throw new PackOpeningValidationError('A pack seed is required.');

  const pool = { cards: input.pool };
  const results = product.openingProducts.map((openingProduct, index) =>
    openPack(`${input.seed}:${String(index)}`, pool, openingProduct),
  );
  return { product, results, cards: results.flatMap((result) => result.cards) };
}

export const duplicateExchangePoints: Readonly<Record<PackCard['rarity'], number>> = {
  N: 5,
  R: 15,
  SR: 50,
  SSR: 150,
  UR: 500,
};

export interface CardGrant {
  readonly cardVersionId: string;
  readonly granted: number;
  readonly retained: number;
  readonly converted: number;
  readonly exchangePoints: number;
}

/** Applies the universal three-copy cap to one opening result without mutating the input. */
export function calculateCardGrants(
  cards: readonly PackCard[],
  existingQuantities: ReadonlyMap<string, number>,
): readonly CardGrant[] {
  const pending = new Map<string, { card: PackCard; granted: number }>();
  for (const card of cards) {
    const current = pending.get(card.id);
    if (current === undefined) pending.set(card.id, { card, granted: 1 });
    else current.granted += 1;
  }

  return [...pending.entries()].map(([cardVersionId, entry]) => {
    const owned = existingQuantities.get(cardVersionId) ?? 0;
    const retained = Math.max(0, Math.min(entry.granted, 3 - owned));
    const converted = entry.granted - retained;
    return {
      cardVersionId,
      granted: entry.granted,
      retained,
      converted,
      exchangePoints: converted * duplicateExchangePoints[entry.card.rarity],
    };
  });
}
