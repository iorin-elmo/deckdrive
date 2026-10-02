import { describe, expect, it } from 'vitest';
import { rankProgress } from './read-service.js';
import { rankPresentationConfig } from './rank-presentation.js';

describe('rank progress', () => {
  it('maps boundary ratings to their configured division and RR', () => {
    expect(rankProgress(-20)).toEqual({ name: 'BRONZE', division: 'III', rr: 0, rrGoal: 100 });
    expect(rankProgress(1200)).toEqual({ name: 'SILVER', division: 'III', rr: 0, rrGoal: 100 });
    expect(rankProgress(1500)).toEqual({ name: 'GOLD', division: 'II', rr: 50, rrGoal: 100 });
    expect(rankProgress(2200)).toEqual({
      name: 'GRAND_MASTER',
      division: 'III',
      rr: 0,
      rrGoal: 100,
    });
  });

  it('uses a supplied presentation policy for boundaries, divisions, and RR scale', () => {
    const custom = {
      ...rankPresentationConfig,
      bands: [
        { name: 'BRONZE', floor: 0 },
        { name: 'SILVER', floor: 1000 },
      ],
      divisions: ['II', 'I'],
      rrPerDivision: 50,
    };
    expect(rankProgress(750, custom)).toEqual({
      name: 'BRONZE',
      division: 'I',
      rr: 25,
      rrGoal: 50,
    });
    expect(() => rankProgress(750, { ...custom, divisions: [] })).toThrow(RangeError);
    expect(() => rankProgress(Number.NaN, custom)).toThrow(RangeError);
  });
});
