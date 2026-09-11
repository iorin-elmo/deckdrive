import type { RandomSource } from '../index.js';

const UINT32_RANGE = 0x1_0000_0000;

export interface SeededRandomState {
  readonly state: number;
}

/**
 * A deterministic pseudo-random source whose state can be saved for replay.
 * It is instance-local and intentionally does not use Math.random().
 */
export class SeededRandom implements RandomSource {
  #state: number;

  public constructor(seed: string | number) {
    this.#state = normalizeSeed(seed);
  }

  public next(): number {
    let value = (this.#state += 0x6d2b_79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  public snapshot(): SeededRandomState {
    return { state: this.#state >>> 0 };
  }

  public restore(snapshot: SeededRandomState): void {
    this.#state = normalizeState(snapshot.state);
  }
}

export interface FixedRandomState {
  readonly position: number;
}

/** A finite deterministic source for tests and fixtures. */
export class FixedRandom implements RandomSource {
  readonly #values: readonly number[];
  #position = 0;

  public constructor(values: readonly number[]) {
    this.#values = values.map(validateRandomValue);
  }

  public next(): number {
    const value = this.#values[this.#position];

    if (value === undefined) {
      throw new RangeError('FixedRandom has no remaining values.');
    }

    this.#position += 1;
    return value;
  }

  public snapshot(): FixedRandomState {
    return { position: this.#position };
  }

  public restore(snapshot: FixedRandomState): void {
    if (!Number.isInteger(snapshot.position) || snapshot.position < 0) {
      throw new RangeError('FixedRandom state position must be a non-negative integer.');
    }

    this.#position = snapshot.position;
  }
}

function normalizeSeed(seed: string | number): number {
  if (typeof seed === 'number') {
    return normalizeState(seed);
  }

  let hash = 0x811c_9dc5;

  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x0100_0193);
  }

  return hash >>> 0;
}

function normalizeState(state: number): number {
  if (!Number.isFinite(state) || !Number.isInteger(state)) {
    throw new RangeError('Random state must be a finite integer.');
  }

  return state >>> 0;
}

function validateRandomValue(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('FixedRandom values must be within [0, 1).');
  }

  return value;
}
