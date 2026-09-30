import { describe, expect, it } from 'vitest';

import { addExperience, missionPeriodStart, nextLoginCycle } from './progression.js';

describe('mission progression', () => {
  it('uses Monday as the server-authoritative weekly reset', () => {
    expect(missionPeriodStart('WEEKLY', new Date('2026-09-27T23:00:00.000Z')).toISOString()).toBe(
      '2026-09-21T00:00:00.000Z',
    );
  });

  it('levels up without changing combat state', () => {
    expect(addExperience({ experience: 190, level: 1 }, 20)).toEqual({ experience: 210, level: 2 });
  });

  it('resets a broken login streak and wraps a seven-day cycle', () => {
    expect(
      nextLoginCycle(new Date('2026-09-26T10:00:00.000Z'), { day: '2026-09-25', cycleDay: 7 }),
    ).toEqual({ day: '2026-09-26', cycleDay: 1 });
    expect(
      nextLoginCycle(new Date('2026-09-28T10:00:00.000Z'), { day: '2026-09-25', cycleDay: 4 }),
    ).toEqual({ day: '2026-09-28', cycleDay: 1 });
  });
});
