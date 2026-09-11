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

  it('rejects non-semver versions, invalid rarities, and malformed effects', () => {
    const invalidVersion = { ...basicCardDefinitions[0], version: '01.2.3' } as CardDefinition;
    const invalidRarity = {
      ...basicCardDefinitions[0],
      rarity: 'INVALID',
    } as unknown as CardDefinition;
    const invalidDamageTarget = {
      ...basicCardDefinitions[0],
      effects: [{ type: 'DAMAGE', amount: 1, target: 'ALLY' }],
    } as unknown as CardDefinition;
    const invalidCustomResolver = {
      ...basicCardDefinitions[0],
      effects: [{ type: 'CUSTOM', target: 'SELF', resolver: '  ' }],
    } as unknown as CardDefinition;
    const unknownEffect = {
      ...basicCardDefinitions[0],
      effects: [{ type: 'UNKNOWN' }],
    } as unknown as CardDefinition;
    const missingEffects = {
      ...basicCardDefinitions[0],
      effects: null,
    } as unknown as CardDefinition;
    const invalidId = { ...basicCardDefinitions[0], id: 'sword__strike' } as CardDefinition;

    for (const invalid of [
      invalidVersion,
      invalidRarity,
      invalidDamageTarget,
      invalidCustomResolver,
      unknownEffect,
      missingEffects,
      invalidId,
    ]) {
      expect(validateCardDefinition(invalid)).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([expect.objectContaining({ code: expect.any(String) })]),
      });
    }

    expect(validateCardDefinition(invalidVersion)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_VERSION' })]),
    });
    expect(validateCardDefinition(invalidRarity)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_RARITY' })]),
    });
    expect(validateCardDefinition(invalidDamageTarget)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_EFFECT' })]),
    });
    expect(validateCardDefinition(invalidCustomResolver)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_EFFECT' })]),
    });
    expect(validateCardDefinition(unknownEffect)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_EFFECT' })]),
    });
    expect(validateCardDefinition(missingEffects)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_EFFECT' })]),
    });
    expect(validateCardDefinition(invalidId)).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_ID' })]),
    });
  });

  it('safely rejects malformed deserialized definitions and collections', () => {
    for (const invalid of [
      null,
      undefined,
      { ...basicCardDefinitions[0], id: 'sword_strike\n' },
      { ...basicCardDefinitions[0], id: ['sword_strike'] },
      { ...basicCardDefinitions[0], version: '1.0.0\n' },
      { ...basicCardDefinitions[0], version: ['1.0.0'] },
    ]) {
      expect(validateCardDefinition(invalid)).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([expect.objectContaining({ code: expect.any(String) })]),
      });
    }

    for (const invalid of [null, undefined, {}, [null], [undefined]]) {
      expect(validateCardDefinitions(invalid)).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_DEFINITION' })]),
      });
    }
  });
});
