import { describe, expect, it } from 'vitest';

import { FixedRandom, SeededRandom } from './index.js';

describe('SeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const first = new SeededRandom('match-42');
    const second = new SeededRandom('match-42');

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
    const values = Array.from({ length: 100 }, () => first.next());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('continues the same sequence after state restoration', () => {
    const random = new SeededRandom('match-42');
    random.next();
    const snapshot = random.snapshot();
    const expected = [random.next(), random.next()];

    const restored = new SeededRandom('different-seed');
    restored.restore(snapshot);

    expect([restored.next(), restored.next()]).toEqual(expected);
  });
});

describe('FixedRandom', () => {
  it('returns configured values and supports restoration', () => {
    const random = new FixedRandom([0.1, 0.8]);

    expect(random.next()).toBe(0.1);
    const snapshot = random.snapshot();
    expect(random.next()).toBe(0.8);
    random.restore(snapshot);
    expect(random.next()).toBe(0.8);
  });

  it('rejects invalid values and exhausted sources', () => {
    expect(() => new FixedRandom([1])).toThrow(RangeError);
    expect(() => new FixedRandom(new Array<number>(1))).toThrow(RangeError);

    const random = new FixedRandom([]);
    expect(() => random.next()).toThrow('FixedRandom has no remaining values.');
    expect(() => random.restore({ position: 1 })).toThrow(RangeError);
  });
});
