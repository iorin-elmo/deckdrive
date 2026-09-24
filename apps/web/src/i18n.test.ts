import { describe, expect, it } from 'vitest';

import { basicCardDefinitions } from '@deck-drive/card-definitions';

import { localizeCard, localizeCardMetadata } from './i18n.js';

describe('localizeCard', () => {
  const strike = basicCardDefinitions.find((card) => card.id === 'sword_strike')!;

  it('uses the canonical English card text', () => {
    expect(localizeCard(strike, 'en')).toMatchObject({
      name: 'Strike',
      description: 'Deal 6 damage.',
    });
  });

  it('returns Japanese card text for the Japanese locale', () => {
    expect(localizeCard(strike, 'ja')).toEqual({
      name: '一閃',
      description: '敵に6ダメージを与える。',
    });
  });
});

describe('localizeCardMetadata', () => {
  it('translates card metadata for the Japanese locale', () => {
    expect(localizeCardMetadata('SWORD', 'ja')).toBe('剣士');
    expect(localizeCardMetadata('ATTACK', 'ja')).toBe('攻撃');
    expect(localizeCardMetadata('RARE', 'ja')).toBe('レア');
  });
});
