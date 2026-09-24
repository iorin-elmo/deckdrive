import { describe, expect, it } from 'vitest';

import { basicCardDefinitions } from '@deck-drive/card-definitions';

import {
  localizeBattlePhase,
  localizeCard,
  localizeCardMetadata,
  localizePurchaseFrequencyPeriod,
  localizedCardName,
} from './i18n.js';

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

  it('uses version-specific Japanese text when a translated card changes', () => {
    expect(
      localizeCard(
        { ...strike, version: '1.1.0', name: 'Strike+', description: 'Deal a bit more damage.' },
        'ja',
      ),
    ).toEqual({ name: '一閃+', description: '敵に7ダメージを与える。' });
  });

  it('does not use a different card version when resolving a battle card name', () => {
    expect(localizedCardName('sword_strike', '1.1.0', 'ja')).toBe('sword_strike');
  });
});

describe('localizeCardMetadata', () => {
  it('translates card metadata for the Japanese locale', () => {
    expect(localizeCardMetadata('SWORD', 'ja')).toBe('剣士');
    expect(localizeCardMetadata('ATTACK', 'ja')).toBe('攻撃');
    expect(localizeCardMetadata('RARE', 'ja')).toBe('レア');
    expect(localizeCardMetadata('SSR', 'ja')).toBe('SSR');
  });
});

describe('localizeBattlePhase', () => {
  it('translates terminal phases', () => {
    expect(localizeBattlePhase('MATCH_END', 'ja')).toBe('対戦終了');
  });
});

describe('localizePurchaseFrequencyPeriod', () => {
  it('uses singular English nouns in purchase-frequency messages', () => {
    expect(localizePurchaseFrequencyPeriod('WEEK', 'en')).toBe('week');
    expect(localizePurchaseFrequencyPeriod('MONTH', 'en')).toBe('month');
  });
});
