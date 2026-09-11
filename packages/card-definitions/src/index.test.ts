import { describe, expect, it } from 'vitest';

import type { CardDefinition } from './index.js';

describe('card-definition public contracts', () => {
  it('represents the documented Sword card DSL vocabulary', () => {
    const strike = {
      id: 'sword_strike',
      version: '1.0.0',
      name: 'Strike',
      class: 'SWORD',
      rarity: 'BASIC',
      cost: 1,
      type: 'ATTACK',
      description: 'Deal 6 damage.',
      effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }],
      keywords: [],
      artwork: null,
      deckLimit: null,
    } satisfies CardDefinition;

    expect(strike.effects[0]).toMatchObject({ type: 'DAMAGE', target: 'ENEMY' });
  });
});
