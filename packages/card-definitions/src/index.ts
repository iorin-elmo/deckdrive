/** Versioned, serializable card-definition contracts. */
export const packageName = '@deck-drive/card-definitions' as const;

export type CardClass =
  'SWORD' | 'GUARDIAN' | 'MAGE' | 'ALCHEMIST' | 'HUNTER' | 'TRICKSTER' | 'NEUTRAL';
export type CardRarity = 'BASIC' | 'COMMON' | 'UNCOMMON' | 'RARE' | 'N' | 'R' | 'SR' | 'SSR' | 'UR';
export type CardType = 'ATTACK' | 'SKILL' | 'POWER' | 'REACTION' | 'CURSE';
export type EffectTarget = 'SELF' | 'ENEMY';

/** Translatable display text supplied with a versioned card definition. */
export interface CardTranslation {
  readonly name: string;
  readonly description: string;
}

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
  /** Optional display translations for card-data versions not bundled in the web app. */
  readonly translations?: Readonly<Partial<Record<'ja', CardTranslation>>>;
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
  | 'INVALID_DEFINITION'
  | 'INVALID_DECK_LIMIT'
  | 'INVALID_DESCRIPTION'
  | 'INVALID_EFFECT'
  | 'INVALID_ID'
  | 'INVALID_KEYWORDS'
  | 'INVALID_NAME'
  | 'INVALID_RARITY'
  | 'INVALID_TYPE'
  | 'INVALID_TRANSLATIONS'
  | 'INVALID_VERSION'
  | 'INVALID_ARTWORK'
  | 'MISSING_EFFECT';

export interface CardDefinitionValidationError {
  readonly code: CardDefinitionValidationCode;
  readonly message: string;
}

export type CardDefinitionValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly CardDefinitionValidationError[] };

const cardClasses = new Set<string>([
  'SWORD',
  'GUARDIAN',
  'MAGE',
  'ALCHEMIST',
  'HUNTER',
  'TRICKSTER',
  'NEUTRAL',
]);
const cardTypes = new Set<string>(['ATTACK', 'SKILL', 'POWER', 'REACTION', 'CURSE']);
const cardRarities = new Set<string>([
  'BASIC',
  'COMMON',
  'UNCOMMON',
  'RARE',
  'N',
  'R',
  'SR',
  'SSR',
  'UR',
]);

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
  {
    id: 'sword_lunge',
    version: '1.0.0',
    name: 'Lunge',
    class: 'SWORD',
    rarity: 'BASIC',
    cost: 1,
    type: 'ATTACK',
    description: 'Deal 4 damage.',
    effects: [{ type: 'DAMAGE', amount: 4, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'sword_riposte',
    version: '1.0.0',
    name: 'Riposte',
    class: 'SWORD',
    rarity: 'BASIC',
    cost: 1,
    type: 'ATTACK',
    description: 'Deal 5 damage.',
    effects: [{ type: 'DAMAGE', amount: 5, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'guardian_bulwark',
    version: '1.0.0',
    name: 'Bulwark',
    class: 'GUARDIAN',
    rarity: 'BASIC',
    cost: 1,
    type: 'SKILL',
    description: 'Gain 7 block.',
    effects: [{ type: 'GAIN_BLOCK', amount: 7, target: 'SELF' }],
    keywords: ['block'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'guardian_mend',
    version: '1.0.0',
    name: 'Mend',
    class: 'GUARDIAN',
    rarity: 'BASIC',
    cost: 1,
    type: 'SKILL',
    description: 'Heal 3 health.',
    effects: [{ type: 'HEAL', amount: 3, target: 'SELF' }],
    keywords: ['heal'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'neutral_focus',
    version: '1.0.0',
    name: 'Focus',
    class: 'NEUTRAL',
    rarity: 'BASIC',
    cost: 0,
    type: 'SKILL',
    description: 'Draw 1 card.',
    effects: [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    keywords: ['draw'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'neutral_spark',
    version: '1.0.0',
    name: 'Spark',
    class: 'NEUTRAL',
    rarity: 'BASIC',
    cost: 1,
    type: 'ATTACK',
    description: 'Deal 3 damage.',
    effects: [{ type: 'DAMAGE', amount: 3, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'neutral_recovery',
    version: '1.0.0',
    name: 'Recovery',
    class: 'NEUTRAL',
    rarity: 'BASIC',
    cost: 1,
    type: 'SKILL',
    description: 'Heal 2 health.',
    effects: [{ type: 'HEAL', amount: 2, target: 'SELF' }],
    keywords: ['heal'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
];

/** Minimal Phase 6 pool, kept separate so starter cards remain always available. */
export const packCardDefinitions: readonly CardDefinition[] = [
  {
    id: 'pack_scout',
    version: '1.0.0',
    name: 'Scout',
    class: 'HUNTER',
    rarity: 'N',
    cost: 1,
    type: 'ATTACK',
    description: 'Deal 3 damage.',
    effects: [{ type: 'DAMAGE', amount: 3, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'pack_vanguard',
    version: '1.0.0',
    name: 'Vanguard',
    class: 'SWORD',
    rarity: 'R',
    cost: 2,
    type: 'ATTACK',
    description: 'Deal 7 damage.',
    effects: [{ type: 'DAMAGE', amount: 7, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'pack_aegis',
    version: '1.0.0',
    name: 'Aegis',
    class: 'GUARDIAN',
    rarity: 'SR',
    cost: 2,
    type: 'SKILL',
    description: 'Gain 11 block.',
    effects: [{ type: 'GAIN_BLOCK', amount: 11, target: 'SELF' }],
    keywords: ['block'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'pack_starfall',
    version: '1.0.0',
    name: 'Starfall',
    class: 'MAGE',
    rarity: 'SSR',
    cost: 3,
    type: 'ATTACK',
    description: 'Deal 12 damage.',
    effects: [{ type: 'DAMAGE', amount: 12, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
  {
    id: 'pack_eternal_mend',
    version: '1.0.0',
    name: 'Eternal Mend',
    class: 'ALCHEMIST',
    rarity: 'UR',
    cost: 3,
    type: 'SKILL',
    description: 'Restore 10 health.',
    effects: [{ type: 'HEAL', amount: 10, target: 'SELF' }],
    keywords: ['heal'],
    artwork: null,
    deckLimit: maximumCardCopies,
  },
];

export function validateCardDefinition(card: unknown): CardDefinitionValidationResult {
  const errors: CardDefinitionValidationError[] = [];

  if (!isRecord(card)) {
    return invalidDefinitionResult();
  }

  if (typeof card.id !== 'string' || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?![\s\S])/.test(card.id)) {
    errors.push({ code: 'INVALID_ID', message: 'Card ID must be lower snake case.' });
  }

  if (
    typeof card.version !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?![\s\S])/.test(card.version)
  ) {
    errors.push({ code: 'INVALID_VERSION', message: 'Card version must use semver x.y.z.' });
  }

  if (typeof card.class !== 'string' || !cardClasses.has(card.class)) {
    errors.push({ code: 'INVALID_CLASS', message: 'Card class is not supported.' });
  }

  if (typeof card.rarity !== 'string' || !cardRarities.has(card.rarity)) {
    errors.push({ code: 'INVALID_RARITY', message: 'Card rarity is not supported.' });
  }

  if (typeof card.type !== 'string' || !cardTypes.has(card.type)) {
    errors.push({ code: 'INVALID_TYPE', message: 'Card type is not supported.' });
  }

  if (typeof card.name !== 'string') {
    errors.push({ code: 'INVALID_NAME', message: 'Card name must be a string.' });
  }

  if (typeof card.description !== 'string') {
    errors.push({ code: 'INVALID_DESCRIPTION', message: 'Card description must be a string.' });
  }

  if (!hasValidTranslations(card.translations)) {
    errors.push({
      code: 'INVALID_TRANSLATIONS',
      message: 'Card translations must contain Japanese name and description strings.',
    });
  }

  if (
    !Array.isArray(card.keywords) ||
    !card.keywords.every((keyword) => typeof keyword === 'string')
  ) {
    errors.push({
      code: 'INVALID_KEYWORDS',
      message: 'Card keywords must be an array of strings.',
    });
  }

  if (card.artwork !== null && typeof card.artwork !== 'string') {
    errors.push({ code: 'INVALID_ARTWORK', message: 'Card artwork must be a string or null.' });
  }

  if (typeof card.cost !== 'number' || !Number.isInteger(card.cost) || card.cost < 0) {
    errors.push({ code: 'INVALID_COST', message: 'Card cost must be a non-negative integer.' });
  }

  if (
    card.deckLimit !== null &&
    (typeof card.deckLimit !== 'number' ||
      !Number.isInteger(card.deckLimit) ||
      card.deckLimit < 1 ||
      card.deckLimit > maximumCardCopies)
  ) {
    errors.push({
      code: 'INVALID_DECK_LIMIT',
      message: `Deck limit must be null or an integer from 1 to ${maximumCardCopies}.`,
    });
  }

  if (!Array.isArray(card.effects)) {
    errors.push({ code: 'INVALID_EFFECT', message: 'Card effects must be an array.' });
  } else {
    if (card.effects.length === 0) {
      errors.push({ code: 'MISSING_EFFECT', message: 'Card must define at least one effect.' });
    }

    for (const effect of card.effects) {
      if (!isValidCardEffect(effect)) {
        errors.push({ code: 'INVALID_EFFECT', message: 'Card effect is not supported.' });
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function hasValidTranslations(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const japanese = value.ja;
  return (
    Object.keys(value).length === 1 &&
    isRecord(japanese) &&
    typeof japanese.name === 'string' &&
    typeof japanese.description === 'string'
  );
}

function isValidCardEffect(effect: unknown): effect is CardEffect {
  if (typeof effect !== 'object' || effect === null || !('type' in effect)) {
    return false;
  }

  const value = effect as Record<string, unknown>;
  const hasPositiveAmount = Number.isInteger(value.amount) && (value.amount as number) > 0;
  const hasSupportedTarget = value.target === 'SELF' || value.target === 'ENEMY';

  switch (value.type) {
    case 'DAMAGE':
      return hasPositiveAmount && hasSupportedTarget;
    case 'HEAL':
    case 'GAIN_BLOCK':
    case 'DRAW':
      return hasPositiveAmount && value.target === 'SELF';
    case 'CUSTOM':
      return (
        hasSupportedTarget && typeof value.resolver === 'string' && value.resolver.trim().length > 0
      );
    default:
      return false;
  }
}

export function validateCardDefinitions(cards: unknown): CardDefinitionValidationResult {
  const errors: CardDefinitionValidationError[] = [];
  const seenIds = new Set<string>();

  if (!Array.isArray(cards)) {
    return invalidDefinitionResult('Card definitions must be an array.');
  }

  for (const card of cards) {
    if (isRecord(card) && typeof card.id === 'string') {
      if (seenIds.has(card.id)) {
        errors.push({ code: 'DUPLICATE_ID', message: `Card ID is duplicated: ${card.id}.` });
      }

      seenIds.add(card.id);
    }

    const result = validateCardDefinition(card);

    if (!result.ok) {
      errors.push(...result.errors);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidDefinitionResult(
  message = 'Card definition must be an object.',
): CardDefinitionValidationResult {
  return { ok: false, errors: [{ code: 'INVALID_DEFINITION', message }] };
}
