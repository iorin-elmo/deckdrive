import type { RewardCurrency } from '../rewards/reward-ledger.js';

export type DailyMissionMetric =
  'CPU_BATTLE' | 'PVP_BATTLE' | 'CARD_PLAY' | 'DAMAGE' | 'BLOCK' | 'WIN';

export interface DailyMissionDefinition {
  readonly id: string;
  readonly metric: DailyMissionMetric;
  readonly target: number;
  readonly reward: { readonly currency: RewardCurrency; readonly amount: number };
}

export interface DailyMissionProgress {
  readonly missionId: string;
  readonly day: string;
  readonly progress: number;
  readonly claimed: boolean;
}

/** Returns the server-authoritative UTC day key used for daily mission rollover. */
export function missionDay(now: Date): string {
  if (Number.isNaN(now.valueOf())) throw new Error('Mission time must be a valid date.');
  return now.toISOString().slice(0, 'YYYY-MM-DD'.length);
}

export function advanceDailyMission(
  definition: DailyMissionDefinition,
  progress: DailyMissionProgress,
  amount: number,
  now: Date,
): DailyMissionProgress {
  if (definition.id !== progress.missionId)
    throw new Error('Mission progress does not match definition.');
  if (!Number.isInteger(amount) || amount < 0)
    throw new Error('Mission progress amount must be non-negative.');
  const current =
    progress.day === missionDay(now)
      ? progress
      : { ...progress, day: missionDay(now), progress: 0, claimed: false };
  return { ...current, progress: Math.min(definition.target, current.progress + amount) };
}

export function isDailyMissionComplete(
  definition: DailyMissionDefinition,
  progress: DailyMissionProgress,
): boolean {
  return definition.id === progress.missionId && progress.progress >= definition.target;
}

export function canClaimDailyMission(
  definition: DailyMissionDefinition,
  progress: DailyMissionProgress,
  now: Date,
): boolean {
  return (
    progress.day === missionDay(now) &&
    !progress.claimed &&
    isDailyMissionComplete(definition, progress)
  );
}
