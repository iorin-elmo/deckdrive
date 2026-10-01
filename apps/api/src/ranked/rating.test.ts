import { describe, expect, it } from 'vitest';

import { calculateRatingChange, softResetRating } from './rating.js';

const base = {
  rating: 1500,
  opponentRating: 1500,
  damageDealt: 0,
  opponentInitialHp: 30,
} as const;

describe('ranked rating strategy', () => {
  it.each([
    [0, 40],
    [20, 40],
    [21, 28],
    [100, 28],
    [101, 20],
  ])('uses the configured K for %i completed games (K=%i)', (completedGames, expectedK) => {
    const result = calculateRatingChange({ ...base, completedGames, outcome: 'WIN' });
    expect(result.k).toBe(expectedK);
    expect(result.delta).toBe(expectedK / 2);
  });

  it('uses Elo expectation from both server ratings', () => {
    const result = calculateRatingChange({
      ...base,
      opponentRating: 1900,
      completedGames: 101,
      outcome: 'WIN',
    });
    expect(result.expectedScore).toBeCloseTo(1 / 11);
    expect(result.delta).toBeCloseTo(20 * (1 - 1 / 11));
    expect(result.nextRating).toBeCloseTo(1500 + result.delta);
  });

  it('clamps damage ratio and the loss score at 0.45', () => {
    const overkill = calculateRatingChange({
      ...base,
      completedGames: 21,
      outcome: 'LOSS',
      damageDealt: 500,
    });
    expect(overkill.damageRatio).toBe(1);
    expect(overkill.actualScore).toBe(0.45);
    expect(overkill.delta).toBeCloseTo(28 * (0.45 - 0.5));
  });

  it('never turns a loss into a rating gain through the performance bonus', () => {
    const withoutBonus = calculateRatingChange({
      ...base,
      opponentRating: 1900,
      completedGames: 0,
      outcome: 'LOSS',
    });
    const withBonus = calculateRatingChange({
      ...base,
      opponentRating: 1900,
      completedGames: 0,
      outcome: 'LOSS',
      damageDealt: 30,
    });
    expect(withoutBonus.delta).toBeLessThan(0);
    expect(withBonus.actualScore).toBe(0.45);
    expect(withBonus.actualScore).toBeGreaterThan(withBonus.expectedScore);
    expect(withBonus.delta).toBe(0);
    expect(withBonus.nextRating).toBe(base.rating);
  });

  it('uses dealt damage only for a loss and supports a draw', () => {
    const loss = calculateRatingChange({
      ...base,
      completedGames: 0,
      outcome: 'LOSS',
      damageDealt: 15,
    });
    expect(loss.actualScore).toBeCloseTo(0.225);
    expect(loss.delta).toBeCloseTo(-11);
    expect(
      calculateRatingChange({
        ...base,
        completedGames: 0,
        outcome: 'DRAW',
        damageDealt: 500,
      }).actualScore,
    ).toBe(0.5);
  });

  it('accepts a configured K curve and performance strategy', () => {
    const result = calculateRatingChange(
      { ...base, completedGames: 100, outcome: 'LOSS', damageDealt: 15 },
      {
        kValues: { provisional: 60, regular: 30, veteran: 10 },
        provisionalGames: 10,
        regularGames: 50,
        maxLossScore: 0.4,
        lossDamageWeight: 0.5,
      },
      { lossScore: ({ damageRatio }) => damageRatio * 0.2 },
    );
    expect(result.k).toBe(10);
    expect(result.actualScore).toBeCloseTo(0.1);
  });

  it('does not evaluate loss performance for a win or draw', () => {
    const performance = {
      lossScore: () => {
        throw new Error('unexpected loss');
      },
    };
    expect(
      calculateRatingChange({ ...base, completedGames: 0, outcome: 'WIN' }, undefined, performance)
        .actualScore,
    ).toBe(1);
    expect(
      calculateRatingChange({ ...base, completedGames: 0, outcome: 'DRAW' }, undefined, performance)
        .actualScore,
    ).toBe(0.5);
  });

  it.each([
    { completedGames: -1 },
    { completedGames: 1.5 },
    { rating: Number.NaN },
    { opponentRating: Number.POSITIVE_INFINITY },
    { damageDealt: -1 },
    { opponentInitialHp: 0 },
  ])('rejects invalid authoritative inputs: %o', (invalid) => {
    expect(() =>
      calculateRatingChange({ ...base, completedGames: 0, outcome: 'LOSS', ...invalid }),
    ).toThrow(RangeError);
  });

  it('soft resets toward a configured anchor without touching card state', () => {
    expect(softResetRating(1900, { anchor: 1500, retention: 0.5 })).toBe(1700);
    expect(softResetRating(1100, { anchor: 1500, retention: 0.5 })).toBe(1300);
    expect(() => softResetRating(1500, { anchor: 1500, retention: 1.1 })).toThrow(RangeError);
  });
});
