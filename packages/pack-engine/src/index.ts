export type PackRarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR';
export type PackProduct = 'NORMAL_PACK' | 'RARE_PACK' | 'BOX';

export interface PackCard {
  readonly id: string;
  readonly rarity: PackRarity;
}

export interface PackPool {
  readonly cards: readonly PackCard[];
}

export interface OpenedPack {
  readonly product: 'NORMAL_PACK' | 'RARE_PACK';
  readonly cards: readonly PackCard[];
}

export interface OpenedBox {
  readonly product: 'BOX';
  readonly packs: readonly OpenedPack[];
  readonly cards: readonly PackCard[];
}

const packSize = 5;
const boxPackCount = 10;
const rarities: readonly PackRarity[] = ['N', 'R', 'SR', 'SSR', 'UR'];

/**
 * Opens a product deterministically from a seed. It has no persistence or UI
 * dependency, so the API can compose it inside its transactional opening flow.
 */
export function openPack(
  seed: string,
  pool: PackPool,
  product: PackProduct,
): OpenedPack | OpenedBox {
  const random = seededRandom(seed);
  assertPool(pool);
  if (product === 'BOX') return openBoxWithRandom(pool, random);
  return openSinglePack(pool, random, product);
}

function openBoxWithRandom(pool: PackPool, random: () => number): OpenedBox {
  const packs = Array.from({ length: boxPackCount }, () =>
    openSinglePack(pool, random, 'NORMAL_PACK'),
  );
  const cards = packs.flatMap((pack) => pack.cards);
  ensureMinimum(cards, pool, 'SR', 2, random);
  ensureMinimum(cards, pool, 'UR', 1, random);
  const guaranteedPacks = packs.map((pack, index) => ({
    ...pack,
    cards: cards.slice(index * packSize, (index + 1) * packSize),
  }));
  return { product: 'BOX', packs: guaranteedPacks, cards };
}

function openSinglePack(
  pool: PackPool,
  random: () => number,
  product: OpenedPack['product'],
): OpenedPack {
  const cards = Array.from({ length: packSize }, () => pick(pool.cards, random));
  if (product === 'NORMAL_PACK') ensureMinimum(cards, pool, 'R', 1, random);
  else {
    ensureMinimum(cards, pool, 'R', packSize, random);
    ensureMinimum(cards, pool, 'UR', 1, random);
  }
  return { product, cards };
}

function ensureMinimum(
  cards: PackCard[],
  pool: PackPool,
  minimum: PackRarity,
  count: number,
  random: () => number,
): void {
  const eligible = pool.cards.filter((card) => rarityRank(card.rarity) >= rarityRank(minimum));
  if (eligible.length === 0) throw new PackPoolError(`Pool has no ${minimum}-or-higher card.`);
  let missing =
    count - cards.filter((card) => rarityRank(card.rarity) >= rarityRank(minimum)).length;
  if (missing <= 0) return;
  const replacementIndexes = cards
    .map((card, index) => (rarityRank(card.rarity) < rarityRank(minimum) ? index : undefined))
    .filter((index): index is number => index !== undefined);
  for (const index of replacementIndexes) {
    if (missing === 0) return;
    cards[index] = pick(eligible, random);
    missing -= 1;
  }
}

function assertPool(pool: PackPool): void {
  if (pool.cards.length === 0) throw new PackPoolError('Pack pool must contain cards.');
  if (!pool.cards.every((card) => card.id.trim().length > 0 && rarities.includes(card.rarity))) {
    throw new PackPoolError('Pack pool contains an invalid card.');
  }
}

function pick<T>(values: readonly T[], random: () => number): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new PackPoolError('Cannot draw from an empty pool.');
  return value;
}

function rarityRank(rarity: PackRarity): number {
  return rarities.indexOf(rarity);
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.codePointAt(0) ?? 0;
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class PackPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackPoolError';
  }
}
