import type { RewardCurrency } from '../rewards/reward-ledger.js';

export type MissionCadence = 'DAILY' | 'WEEKLY';
export type MissionMetric =
  | 'CPU_BATTLE'
  | 'PVP_BATTLE'
  | 'CARD_PLAY'
  | 'DAMAGE'
  | 'BLOCK'
  | 'WIN'
  | 'RANKED_BATTLE'
  | 'CLASS_USAGE'
  | 'DECK_OBJECTIVE';

export interface MissionCatalogEntry {
  readonly id: string;
  readonly cadence: MissionCadence;
  readonly metric: MissionMetric;
  readonly target: number;
  readonly reward: { readonly currency: RewardCurrency; readonly amount: number };
  readonly active: boolean;
}

export type LoginReward =
  | { readonly kind: 'CURRENCY'; readonly currency: RewardCurrency; readonly amount: number }
  | { readonly kind: 'PACK'; readonly productId: 'NORMAL_PACK' | 'RARE_PACK' }
  | { readonly kind: 'COSMETIC'; readonly cosmeticId: string };

/** Server-managed mission definitions. Clients only receive progress and may never submit it. */
export const missionCatalog: readonly MissionCatalogEntry[] = [
  {
    id: 'daily.cpu-battle',
    cadence: 'DAILY',
    metric: 'CPU_BATTLE',
    target: 1,
    reward: { currency: 'GEM', amount: 20 },
    active: true,
  },
  {
    id: 'daily.pvp-battle',
    cadence: 'DAILY',
    metric: 'PVP_BATTLE',
    target: 1,
    reward: { currency: 'GEM', amount: 30 },
    active: false,
  },
  {
    id: 'daily.card-play',
    cadence: 'DAILY',
    metric: 'CARD_PLAY',
    target: 10,
    reward: { currency: 'GEM', amount: 20 },
    active: false,
  },
  {
    id: 'daily.damage',
    cadence: 'DAILY',
    metric: 'DAMAGE',
    target: 40,
    reward: { currency: 'GEM', amount: 25 },
    active: false,
  },
  {
    id: 'daily.block',
    cadence: 'DAILY',
    metric: 'BLOCK',
    target: 20,
    reward: { currency: 'GEM', amount: 20 },
    active: false,
  },
  {
    id: 'daily.win',
    cadence: 'DAILY',
    metric: 'WIN',
    target: 1,
    reward: { currency: 'GEM', amount: 40 },
    active: false,
  },
  {
    id: 'weekly.ranked-battle',
    cadence: 'WEEKLY',
    metric: 'RANKED_BATTLE',
    target: 5,
    reward: { currency: 'GEM', amount: 120 },
    active: false,
  },
  {
    id: 'weekly.class-usage',
    cadence: 'WEEKLY',
    metric: 'CLASS_USAGE',
    target: 3,
    reward: { currency: 'EXCHANGE_POINT', amount: 80 },
    active: false,
  },
  {
    id: 'weekly.deck-objective',
    cadence: 'WEEKLY',
    metric: 'DECK_OBJECTIVE',
    target: 3,
    reward: { currency: 'GEM', amount: 100 },
    active: false,
  },
];

export const loginRewardSchedule: readonly {
  readonly cycleDay: number;
  readonly reward: LoginReward;
}[] = [
  { cycleDay: 1, reward: { kind: 'CURRENCY', currency: 'GEM', amount: 20 } },
  { cycleDay: 2, reward: { kind: 'CURRENCY', currency: 'EXCHANGE_POINT', amount: 25 } },
  { cycleDay: 3, reward: { kind: 'PACK', productId: 'NORMAL_PACK' } },
  { cycleDay: 4, reward: { kind: 'CURRENCY', currency: 'GEM', amount: 35 } },
  { cycleDay: 5, reward: { kind: 'COSMETIC', cosmeticId: 'frame.aurora' } },
  { cycleDay: 6, reward: { kind: 'PACK', productId: 'NORMAL_PACK' } },
  { cycleDay: 7, reward: { kind: 'PACK', productId: 'RARE_PACK' } },
];

export function loginRewardForCycleDay(cycleDay: number) {
  const reward = loginRewardSchedule.find((entry) => entry.cycleDay === cycleDay);
  if (reward === undefined) throw new Error('Login reward cycle day must be between 1 and 7.');
  return reward;
}
