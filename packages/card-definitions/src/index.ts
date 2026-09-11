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

export const maximumCardCopies = 3;

export type CardDefinitionValidationCode =
  | 'DUPLICATE_ID'
  | 'INVALID_CLASS'
  | 'INVALID_COST'
  | 'INVALID_DECK_LIMIT'
  | 'INVALID_EFFECT'
  | 'INVALID_ID'
  | 'INVALID_TYPE'
  | 'INVALID_VERSION'
  | 'MISSING_EFFECT';

export interface CardDefinitionValidationError {
  readonly code: CardDefinitionValidationCode;
  readonly message: string;
}

export type CardDefinitionValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly CardDefinitionValidationError[] };

const cardClasses = new Set<CardClass>([
  'SWORD',
  'GUARDIAN',
  'MAGE',
  'ALCHEMIST',
  'HUNTER',
  'TRICKSTER',
  'NEUTRAL',
]);
const cardTypes = new Set<CardType>(['ATTACK', 'SKILL', 'POWER', 'REACTION', 'CURSE']);

export const basicCardDefinitions: readonly CardDefinition[] = [
  {
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
  },
  {
    id: 'guardian_guard',
    version: '1.0.0',
    name: 'Guard',
    class: 'GUARDIAN',
    rarity: 'BASIC',
    cost: 1,
    type: 'SKILL',
    description: 'Gain 5 block.',
    effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }],
    keywords: ['block'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'neutral_insight',
    version: '1.0.0',
    name: 'Insight',
    class: 'NEUTRAL',
    rarity: 'BASIC',
    cost: 1,
    type: 'SKILL',
    description: 'Draw 1 card.',
    effects: [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    keywords: ['draw'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
];

export function validateCardDefinition(card: CardDefinition): CardDefinitionValidationResult {
  const errors: CardDefinitionValidationError[] = [];

  if (!/^[a-z][a-z0-9_]*$/.test(card.id)) {
    errors.push({ code: 'INVALID_ID', message: 'Card ID must be lower snake case.' });
  }

  if (!/^\d+\.\d+\.\d+$/.test(card.version)) {
    errors.push({ code: 'INVALID_VERSION', message: 'Card version must use semver x.y.z.' });
  }

  if (!cardClasses.has(card.class)) {
    errors.push({ code: 'INVALID_CLASS', message: 'Card class is not supported.' });
  }

  if (!cardTypes.has(card.type)) {
    errors.push({ code: 'INVALID_TYPE', message: 'Card type is not supported.' });
  }

  if (!Number.isInteger(card.cost) || card.cost < 0) {
    errors.push({ code: 'INVALID_COST', message: 'Card cost must be a non-negative integer.' });
  }

  if (
    card.deckLimit !== null &&
    (!Number.isInteger(card.deckLimit) || card.deckLimit < 1 || card.deckLimit > maximumCardCopies)
  ) {
    errors.push({
      code: 'INVALID_DECK_LIMIT',
      message: `Deck limit must be null or an integer from 1 to ${maximumCardCopies}.`,
    });
  }

  if (card.effects.length === 0) {
    errors.push({ code: 'MISSING_EFFECT', message: 'Card must define at least one effect.' });
  }

  for (const effect of card.effects) {
    if ('amount' in effect && (!Number.isInteger(effect.amount) || effect.amount < 1)) {
      errors.push({ code: 'INVALID_EFFECT', message: 'Effect amount must be a positive integer.' });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateCardDefinitions(
  cards: readonly CardDefinition[],
): CardDefinitionValidationResult {
  const errors: CardDefinitionValidationError[] = [];
  const seenIds = new Set<string>();

  for (const card of cards) {
    if (seenIds.has(card.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `Card ID is duplicated: ${card.id}.` });
    }

    seenIds.add(card.id);
    const result = validateCardDefinition(card);

    if (!result.ok) {
      errors.push(...result.errors);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
