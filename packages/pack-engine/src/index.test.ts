import { describe, expect, it } from 'vitest';

import { openPack, type PackPool } from './index.js';

const pool: PackPool = {
  cards: [
    { id: 'normal', rarity: 'N' },
    { id: 'rare', rarity: 'R' },
    { id: 'super-rare', rarity: 'SR' },
    { id: 'ultra-rare', rarity: 'UR' },
  ],
};

const rank = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 } as const;

describe('openPack', () => {
  it('is deterministic for the same seed', () => {
    expect(openPack('same-seed', pool, 'BOX')).toEqual(openPack('same-seed', pool, 'BOX'));
  });

  it('opens a five-card normal pack with at least one R-or-higher card', () => {
    const result = openPack('normal', pool, 'NORMAL_PACK');
    if (result.product !== 'NORMAL_PACK') throw new Error('Expected normal pack.');
    expect(result.cards).toHaveLength(5);
    expect(result.cards.some((card) => rank[card.rarity] >= rank.R)).toBe(true);
  });

  it('opens a rare pack with five R-or-higher cards including a UR', () => {
    const result = openPack('rare', pool, 'RARE_PACK');
    if (result.product !== 'RARE_PACK') throw new Error('Expected rare pack.');
    expect(result.cards).toHaveLength(5);
    expect(result.cards.every((card) => rank[card.rarity] >= rank.R)).toBe(true);
    expect(result.cards.some((card) => card.rarity === 'UR')).toBe(true);
  });

  it('opens ten packs and enforces the box SR and UR guarantees', () => {
    const result = openPack('box', pool, 'BOX');
    if (result.product !== 'BOX') throw new Error('Expected box.');
    expect(result.packs).toHaveLength(10);
    expect(result.cards).toHaveLength(50);
    expect(
      result.cards.filter((card) => rank[card.rarity] >= rank.R).length,
    ).toBeGreaterThanOrEqual(10);
    expect(
      result.cards.filter((card) => rank[card.rarity] >= rank.SR).length,
    ).toBeGreaterThanOrEqual(2);
    expect(result.cards.filter((card) => card.rarity === 'UR').length).toBeGreaterThanOrEqual(1);
  });

  it('does not replace cards when a guarantee is already satisfied', () => {
    const result = openPack('already-satisfied', { cards: [{ id: 'ur', rarity: 'UR' }] }, 'BOX');
    expect(result.cards).toHaveLength(50);
    expect(result.cards.every((card) => card.rarity === 'UR')).toBe(true);
  });
});
