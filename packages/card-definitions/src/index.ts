/** Versioned, serializable card-definition contracts. */
export const packageName = '@deck-drive/card-definitions' as const;

export type CardClass =
  'SWORD' | 'GUARDIAN' | 'MAGE' | 'ALCHEMIST' | 'HUNTER' | 'TRICKSTER' | 'NEUTRAL';
export type CardRarity = 'BASIC' | 'COMMON' | 'UNCOMMON' | 'RARE';
export type CardType = 'ATTACK' | 'SKILL' | 'POWER' | 'REACTION' | 'CURSE';
export type EffectTarget = 'SELF' | 'ENEMY';

export type CardEffect =
  | {
      readonly type: 'DAMAGE';
      readonly amount: number;
      readonly target: EffectTarget;
    }
  | {
      readonly type: 'HEAL';
      readonly amount: number;
      readonly target: 'SELF';
    }
  | {
      readonly type: 'GAIN_BLOCK';
      readonly amount: number;
      readonly target: 'SELF';
    }
  | {
      readonly type: 'DRAW';
      readonly amount: number;
      readonly target: 'SELF';
    }
  | {
      readonly type: 'CUSTOM';
      readonly resolver: string;
      readonly target: EffectTarget;
    };

export interface CardDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly class: CardClass;
  readonly rarity: CardRarity;
  readonly cost: number;
  readonly type: CardType;
  readonly description: string;
  readonly effects: readonly CardEffect[];
  readonly keywords: readonly string[];
  readonly artwork: string | null;
  readonly deckLimit: number | null;
}
