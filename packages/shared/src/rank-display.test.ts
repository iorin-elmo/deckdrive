import { describe, expect, it } from 'vitest';

import { rankDisplayConfig, rankProgress } from './rank-display.js';

describe('shared rank display policy', () => {
  it('keeps every rank boundary, division, and Grand Master display width together', () => {
    expect(rankDisplayConfig.bands.map(({ name, floor }) => [name, floor])).toEqual([
      ['BRONZE', 0],
      ['SILVER', 1200],
      ['GOLD', 1400],
      ['PLATINUM', 1600],
      ['DIAMOND', 1800],
      ['MASTER', 2000],
      ['GRAND_MASTER', 2200],
    ]);
    expect(rankDisplayConfig.divisions).toEqual(['III', 'II', 'I']);
    expect(rankDisplayConfig.rrPerDivision).toBe(100);
    expect(rankDisplayConfig.grandMasterDisplayWidth).toBe(300);
  });

  it('maps both sides of rank boundaries and caps Grand Master display progress', () => {
    expect(rankProgress(1199)).toMatchObject({ name: 'BRONZE', division: 'I' });
    expect(rankProgress(1200)).toEqual({ name: 'SILVER', division: 'III', rr: 0 });
    expect(rankProgress(1500)).toEqual({ name: 'GOLD', division: 'II', rr: 50 });
    expect(rankProgress(2200)).toEqual({ name: 'GRAND_MASTER', division: 'III', rr: 0 });
    expect(rankProgress(2499)).toMatchObject({ name: 'GRAND_MASTER', division: 'I' });
    expect(rankProgress(2500)).toEqual({ name: 'GRAND_MASTER', division: 'I', rr: 99 });
    expect(rankProgress(3000)).toEqual(rankProgress(2500));
  });
});
