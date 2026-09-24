import { describe, expect, it } from 'vitest';

import {
  advanceDailyMission,
  canClaimDailyMission,
  missionDay,
  type DailyMissionDefinition,
} from './daily-missions.js';

const definition: DailyMissionDefinition = {
  id: 'daily-cpu-battles',
  metric: 'CPU_BATTLE',
  target: 3,
  reward: { currency: 'GEM', amount: 50 },
};

describe('daily missions', () => {
  it('uses a UTC server-time day boundary', () => {
    expect(missionDay(new Date('2026-09-25T23:59:59.999Z'))).toBe('2026-09-25');
    expect(missionDay(new Date('2026-09-26T00:00:00.000Z'))).toBe('2026-09-26');
  });

  it('caps progress at the target and only enables one claim', () => {
    const complete = advanceDailyMission(
      definition,
      { missionId: definition.id, day: '2026-09-25', progress: 2, claimed: false },
      10,
      new Date('2026-09-25T12:00:00.000Z'),
    );
    expect(complete.progress).toBe(3);
    expect(canClaimDailyMission(definition, complete, new Date('2026-09-25T12:00:00.000Z'))).toBe(
      true,
    );
    expect(
      canClaimDailyMission(
        definition,
        { ...complete, claimed: true },
        new Date('2026-09-25T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('resets stale progress and rejects stale claims after a UTC day rollover', () => {
    const now = new Date('2026-09-26T00:00:00.000Z');
    const stale = { missionId: definition.id, day: '2026-09-25', progress: 3, claimed: false };
    expect(canClaimDailyMission(definition, stale, now)).toBe(false);
    expect(advanceDailyMission(definition, stale, 1, now)).toMatchObject({
      day: '2026-09-26',
      progress: 1,
      claimed: false,
    });
  });
});
