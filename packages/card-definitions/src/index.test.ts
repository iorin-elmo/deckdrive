import { describe, expect, it } from 'vitest';

import {
  basicCardDefinitions,
  maximumCardCopies,
  validateCardDefinition,
  validateCardDefinitions,
} from './index.js';
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
      deckLimit: maximumCardCopies,
    } satisfies CardDefinition;

    expect(strike.effects[0]).toMatchObject({ type: 'DAMAGE', target: 'ENEMY' });
  });

  it('provides one valid basic card for Sword, Guardian, and Neutral', () => {
    expect(basicCardDefinitions.map((card) => card.class)).toEqual([
      'SWORD',
      'GUARDIAN',
      'NEUTRAL',
    ]);
    expect(validateCardDefinitions(basicCardDefinitions)).toEqual({ ok: true });
    expect(basicCardDefinitions.every((card) => card.deckLimit === maximumCardCopies)).toBe(true);
  });

  it('rejects invalid versions, copy limits, effects, and duplicate IDs', () => {
    const invalid = {
      ...basicCardDefinitions[0],
      version: 'v1',
      deckLimit: maximumCardCopies + 1,
      effects: [{ type: 'DAMAGE', amount: 0, target: 'ENEMY' }],
    } as CardDefinition;

    expect(validateCardDefinition(invalid)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_VERSION' }),
        expect.objectContaining({ code: 'INVALID_DECK_LIMIT' }),
        expect.objectContaining({ code: 'INVALID_EFFECT' }),
      ]),
    });
    expect(
      validateCardDefinitions([basicCardDefinitions[0]!, basicCardDefinitions[0]!]),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([expect.objectContaining({ code: 'DUPLICATE_ID' })]),
    });
  });
});
