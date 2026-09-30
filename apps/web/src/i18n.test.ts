import { describe, expect, it } from 'vitest';

import { basicCardDefinitions } from '@deck-drive/card-definitions';

import {
  localizeBattlePhase,
  localizeCard,
  localizeCardMetadata,
  localizeCosmetic,
  localizePurchaseFrequencyPeriod,
  localizeValue,
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
    expect(localizedCardName('sword_strike', '1.1.0', 'ja')).toBe('一閃+');
  });

  it('uses a configured translation for a non-bundled card-data version', () => {
    const configuredCard = {
      ...strike,
      id: 'custom_strike',
      version: '2.0.0',
      name: 'Custom strike',
      description: 'Deal custom damage.',
      translations: { ja: { name: '特注の一撃', description: '特別なダメージを与える。' } },
    };

    expect(localizedCardName('custom_strike', '2.0.0', 'ja', configuredCard)).toBe('特注の一撃');
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

describe('mission and cosmetic localization', () => {
  it('translates mission metrics for the Japanese mission screen', () => {
    expect(localizeValue('CPU_BATTLE', 'ja')).toBe('CPUバトル');
  });

  it('translates catalog cosmetics for the Japanese confirmation screen', () => {
    expect(
      localizeCosmetic(
        {
          id: 'frame.aurora',
          kind: 'CARD_FRAME',
          name: 'Aurora Frame',
          description: 'A cool cyan card frame.',
        },
        'ja',
      ),
    ).toEqual({
      kind: 'カードフレーム',
      name: 'オーロラフレーム',
      description: '涼やかなシアンで彩るカードフレームです。',
    });
  });
});
