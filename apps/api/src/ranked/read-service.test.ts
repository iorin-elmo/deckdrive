import { describe, expect, it } from 'vitest';
import { rankProgress } from './read-service.js';

describe('rank progress', () => {
  it('maps boundary ratings to their configured division and RR', () => {
    expect(rankProgress(-20)).toEqual({ name: 'BRONZE', division: 'III', rr: 0 });
    expect(rankProgress(1200)).toEqual({ name: 'SILVER', division: 'III', rr: 0 });
    expect(rankProgress(1500)).toEqual({ name: 'GOLD', division: 'II', rr: 50 });
    expect(rankProgress(2200)).toEqual({ name: 'GRAND_MASTER', division: 'III', rr: 0 });
  });
});
