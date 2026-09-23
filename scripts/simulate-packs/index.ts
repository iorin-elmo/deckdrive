import { openPack, type PackCard } from '@deck-drive/pack-engine';

const simulations = Number.parseInt(process.env.PACK_SIMULATIONS ?? '10000', 10);
if (!Number.isSafeInteger(simulations) || simulations < 1)
  throw new Error('PACK_SIMULATIONS must be positive.');

const pool: readonly PackCard[] = [
  { id: 'n', rarity: 'N' },
  { id: 'r', rarity: 'R' },
  { id: 'sr', rarity: 'SR' },
  { id: 'ssr', rarity: 'SSR' },
  { id: 'ur', rarity: 'UR' },
];
const rarityCounts = new Map(pool.map((card) => [card.rarity, 0]));
let totalSr = 0;
let totalUr = 0;
let duplicateCards = 0;
const owned = new Map<string, number>();
for (let index = 0; index < simulations; index += 1) {
  const result = openPack(`simulation-${String(index)}`, { cards: pool }, 'BOX');
  for (const card of result.cards) {
    rarityCounts.set(card.rarity, (rarityCounts.get(card.rarity) ?? 0) + 1);
    if (card.rarity === 'SR' || card.rarity === 'SSR' || card.rarity === 'UR') totalSr += 1;
    if (card.rarity === 'UR') totalUr += 1;
    const quantity = owned.get(card.id) ?? 0;
    if (quantity >= 3) duplicateCards += 1;
    owned.set(card.id, quantity + 1);
  }
}
const totalCards = simulations * 50;
console.log(
  JSON.stringify(
    {
      simulations,
      rarityDistribution: Object.fromEntries(rarityCounts),
      averageSr: totalSr / simulations,
      averageUr: totalUr / simulations,
      duplicateRate: duplicateCards / totalCards,
    },
    null,
    2,
  ),
);
