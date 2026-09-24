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
}

/** Server-managed mission definitions. Clients only receive progress and may never submit it. */
export const missionCatalog: readonly MissionCatalogEntry[] = [
  {
    id: 'daily.cpu-battle',
    cadence: 'DAILY',
    metric: 'CPU_BATTLE',
    target: 1,
    reward: { currency: 'GEM', amount: 20 },
  },
  {
    id: 'daily.pvp-battle',
    cadence: 'DAILY',
    metric: 'PVP_BATTLE',
    target: 1,
    reward: { currency: 'GEM', amount: 30 },
  },
  {
    id: 'daily.card-play',
    cadence: 'DAILY',
    metric: 'CARD_PLAY',
    target: 10,
    reward: { currency: 'GEM', amount: 20 },
  },
  {
    id: 'daily.damage',
    cadence: 'DAILY',
    metric: 'DAMAGE',
    target: 40,
    reward: { currency: 'GEM', amount: 25 },
  },
  {
    id: 'daily.block',
    cadence: 'DAILY',
    metric: 'BLOCK',
    target: 20,
    reward: { currency: 'GEM', amount: 20 },
  },
  {
    id: 'daily.win',
    cadence: 'DAILY',
    metric: 'WIN',
    target: 1,
    reward: { currency: 'GEM', amount: 40 },
  },
  {
    id: 'weekly.ranked-battle',
    cadence: 'WEEKLY',
    metric: 'RANKED_BATTLE',
    target: 5,
    reward: { currency: 'GEM', amount: 120 },
  },
  {
    id: 'weekly.class-usage',
    cadence: 'WEEKLY',
    metric: 'CLASS_USAGE',
    target: 3,
    reward: { currency: 'EXCHANGE_POINT', amount: 80 },
  },
  {
    id: 'weekly.deck-objective',
    cadence: 'WEEKLY',
    metric: 'DECK_OBJECTIVE',
    target: 3,
    reward: { currency: 'GEM', amount: 100 },
  },
];

export const loginRewardSchedule: readonly {
  readonly cycleDay: number;
  readonly reward: { readonly currency: RewardCurrency; readonly amount: number };
}[] = [
  { cycleDay: 1, reward: { currency: 'GEM', amount: 20 } },
  { cycleDay: 2, reward: { currency: 'GEM', amount: 25 } },
  { cycleDay: 3, reward: { currency: 'GEM', amount: 30 } },
  { cycleDay: 4, reward: { currency: 'GEM', amount: 35 } },
  { cycleDay: 5, reward: { currency: 'GEM', amount: 40 } },
  { cycleDay: 6, reward: { currency: 'GEM', amount: 50 } },
  { cycleDay: 7, reward: { currency: 'EXCHANGE_POINT', amount: 100 } },
];

export function loginRewardForCycleDay(cycleDay: number) {
  const reward = loginRewardSchedule.find((entry) => entry.cycleDay === cycleDay);
  if (reward === undefined) throw new Error('Login reward cycle day must be between 1 and 7.');
  return reward;
}
