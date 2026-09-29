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
      readonly type: 'GAIN_ENERGY';
      readonly amount: number;
      readonly target: 'SELF';
    }
  | {
      readonly type: 'START_CHANT';
      readonly countdown: number;
      readonly damageDelay?: number;
      readonly completionEffects: readonly CardEffect[];
    }
  | { readonly type: 'ADVANCE_CHANT'; readonly amount: number; readonly drawOnComplete?: boolean }
  | { readonly type: 'RESOLVE_ALL_CHANTS'; readonly blockPerChant: number }
  | { readonly type: 'GAIN_BLOCK_PER_CHANT'; readonly amount: number }
  | { readonly type: 'EXHAUST_GRIMOIRE_ADVANCE_WISH'; readonly amount: number }
  | {
      readonly type: 'SYNTHESIZE';
      readonly mode: 'NORMAL' | 'SAGE_RECIPE' | 'COMPLETE_REACTION' | 'ALL_MATERIALS';
    }
  | { readonly type: 'DRAW_SYNTHESIS_COUNT'; readonly maximum: number }
  | { readonly type: 'SET_ALCHEMY_STAGE'; readonly requiredStage: 1; readonly stage: 3 }
  | {
      readonly type: 'SPECIAL_VICTORY';
      readonly specialVictoryId: 'MAGE_GRAND_WISH' | 'ALCHEMY_SAGE_STONE';
      readonly requiredAlchemyStage?: 3;
    }
  | {
      readonly type: 'REQUEST_CARD_CHOICE';
      readonly from: 'DRAW_PILE';
      readonly maximumCost?: number;
    }
  | { readonly type: 'TRANSFORM_HAND_CARD' }
  | { readonly type: 'SEAL_GRIMOIRE' }
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
  readonly translations?: Readonly<{ ja: CardTranslation }>;
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

/** First playable protocol-2 set for the Mage and Alchemist special-victory routes. */
export const specialVictoryCardDefinitions: readonly CardDefinition[] = [
  {
    id: 'mage_004',
    version: '1.0.0',
    name: 'Chant Acceleration',
    class: 'MAGE',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description: 'Draw 1. Advance one of your chants by 1.',
    translations: {
      ja: { name: '詠唱短縮', description: '1枚引く。自分の詠唱1つの残りカウントを1減らす。' },
    },
    effects: [
      { type: 'DRAW', amount: 1, target: 'SELF' },
      { type: 'ADVANCE_CHANT', amount: 1 },
    ],
    keywords: ['magic', 'chant'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_005',
    version: '1.0.0',
    name: 'Thunderclap',
    class: 'MAGE',
    rarity: 'R',
    cost: 2,
    type: 'ATTACK',
    description: 'Deal 8 damage. Start chant 1; on completion, deal 4 damage.',
    translations: {
      ja: { name: '雷鳴', description: '8ダメージ。詠唱1を開始し、完了時に4ダメージ。' },
    },
    effects: [
      { type: 'DAMAGE', amount: 8, target: 'ENEMY' },
      {
        type: 'START_CHANT',
        countdown: 1,
        completionEffects: [{ type: 'DAMAGE', amount: 4, target: 'ENEMY' }],
      },
    ],
    keywords: ['magic', 'chant'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_006',
    version: '1.0.0',
    name: 'Arcane Barrier',
    class: 'MAGE',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description: 'Gain 7 block, then 2 block for each of your chants.',
    translations: {
      ja: { name: '魔力障壁', description: '7ブロック。自分の詠唱1つにつきさらに2ブロック。' },
    },
    effects: [
      { type: 'GAIN_BLOCK', amount: 7, target: 'SELF' },
      { type: 'GAIN_BLOCK_PER_CHANT', amount: 2 },
    ],
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_009',
    version: '1.0.0',
    name: 'Astral Fall',
    class: 'MAGE',
    rarity: 'SR',
    cost: 3,
    type: 'ATTACK',
    description: 'Deal 16 damage. Start chant 2; on completion, deal 8 damage.',
    translations: {
      ja: { name: '星辰落とし', description: '16ダメージ。詠唱2を開始し、完了時に8ダメージ。' },
    },
    effects: [
      { type: 'DAMAGE', amount: 16, target: 'ENEMY' },
      {
        type: 'START_CHANT',
        countdown: 2,
        completionEffects: [{ type: 'DAMAGE', amount: 8, target: 'ENEMY' }],
      },
    ],
    keywords: ['magic', 'chant'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_010',
    version: '1.0.0',
    name: 'Arcane Transfer',
    class: 'MAGE',
    rarity: 'SR',
    cost: 1,
    type: 'SKILL',
    description: 'Advance one of your chants by 2. If it completes, draw 1.',
    translations: {
      ja: { name: '魔力転写', description: '自分の詠唱1つを2進める。完了したら1枚引く。' },
    },
    effects: [{ type: 'ADVANCE_CHANT', amount: 2, drawOnComplete: true }],
    keywords: ['magic', 'chant'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_015',
    version: '1.0.0',
    name: 'Time Stop',
    class: 'MAGE',
    rarity: 'UR',
    cost: 3,
    type: 'SKILL',
    description: 'Resolve all your chants immediately. Gain 3 block for each.',
    translations: {
      ja: { name: '時間停止', description: '自分の詠唱をすべて即時解決し、1つにつき3ブロック。' },
    },
    effects: [{ type: 'RESOLVE_ALL_CHANTS', blockPerChant: 3 }],
    keywords: ['magic', 'chant'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_016',
    version: '1.0.0',
    name: 'Doomsday Wish',
    class: 'MAGE',
    rarity: 'UR',
    cost: 3,
    type: 'REACTION',
    description: 'Start chant 3; on completion, deal 25 damage. Taking damage delays it by 1.',
    translations: {
      ja: {
        name: '終末の願い',
        description: '詠唱3。完了時25ダメージ。ダメージを受けるたび1遅延。',
      },
    },
    effects: [
      {
        type: 'START_CHANT',
        countdown: 3,
        damageDelay: 1,
        completionEffects: [{ type: 'DAMAGE', amount: 25, target: 'ENEMY' }],
      },
    ],
    keywords: ['magic', 'chant', 'wish'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_017',
    version: '1.0.0',
    name: 'Grand Wish',
    class: 'MAGE',
    rarity: 'UR',
    cost: 3,
    type: 'REACTION',
    description: 'Start chant 100; on completion, win the battle. Taking damage delays it by 5.',
    translations: {
      ja: {
        name: '勝利への願い',
        description: '詠唱100。完了時に特殊勝利。ダメージを受けるたび5遅延。',
      },
    },
    effects: [
      {
        type: 'START_CHANT',
        countdown: 100,
        damageDelay: 5,
        completionEffects: [{ type: 'SPECIAL_VICTORY', specialVictoryId: 'MAGE_GRAND_WISH' }],
      },
    ],
    keywords: ['magic', 'chant', 'wish'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_018',
    version: '1.0.0',
    name: 'Book Burning',
    class: 'MAGE',
    rarity: 'SR',
    cost: 1,
    type: 'SKILL',
    description: 'Exhaust a grimoire. Advance one Grand Wish chant by 10.',
    translations: {
      ja: { name: '焚書', description: '手札の魔導書1枚を廃棄し、「勝利への願い」を10進める。' },
    },
    effects: [{ type: 'EXHAUST_GRIMOIRE_ADVANCE_WISH', amount: 10 }],
    keywords: ['magic'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'mage_019',
    version: '1.0.0',
    name: 'Sealed Grimoire',
    class: 'MAGE',
    rarity: 'R',
    cost: 1,
    type: 'REACTION',
    description:
      'Put a grimoire from your hand on the bottom of your draw pile. Prevent 5 damage from the next hit you take.',
    translations: {
      ja: {
        name: '魔導書の封印',
        description: '手札の魔導書1枚を山札の一番下に置く。次に受けるダメージを5減らす。',
      },
    },
    effects: [{ type: 'SEAL_GRIMOIRE' }],
    keywords: ['magic', 'grimoire'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_001',
    version: '1.0.0',
    name: 'Red Reagent',
    class: 'ALCHEMIST',
    rarity: 'N',
    cost: 0,
    type: 'ATTACK',
    description: 'Deal 2 damage. Red synthesis material.',
    translations: { ja: { name: '赤の試薬', description: '2ダメージ。赤の合成素材。' } },
    effects: [{ type: 'DAMAGE', amount: 2, target: 'ENEMY' }],
    keywords: ['material', 'reagent', 'reagent:red'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_002',
    version: '1.0.0',
    name: 'Blue Reagent',
    class: 'ALCHEMIST',
    rarity: 'N',
    cost: 0,
    type: 'SKILL',
    description: 'Gain 3 block. Blue synthesis material.',
    translations: { ja: { name: '青の試薬', description: '3ブロック。青の合成素材。' } },
    effects: [{ type: 'GAIN_BLOCK', amount: 3, target: 'SELF' }],
    keywords: ['material', 'reagent', 'reagent:blue'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_003',
    version: '1.0.0',
    name: 'Catalyst',
    class: 'ALCHEMIST',
    rarity: 'N',
    cost: 1,
    type: 'SKILL',
    description: 'Draw 1. Catalyst synthesis material.',
    translations: { ja: { name: '触媒', description: '1枚引く。通常合成の触媒素材。' } },
    effects: [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    keywords: ['material', 'catalyst'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_004',
    version: '1.0.0',
    name: 'White Reagent',
    class: 'ALCHEMIST',
    rarity: 'N',
    cost: 1,
    type: 'SKILL',
    description: 'Heal 2. White synthesis material.',
    translations: { ja: { name: '白の試薬', description: '2回復。白の合成素材。' } },
    effects: [{ type: 'HEAL', amount: 2, target: 'SELF' }],
    keywords: ['material', 'reagent', 'reagent:white'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_005',
    version: '1.0.0',
    name: 'Powder Flask',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 1,
    type: 'ATTACK',
    description: 'Deal 7 damage.',
    translations: { ja: { name: '火薬瓶', description: '7ダメージ。' } },
    effects: [{ type: 'DAMAGE', amount: 7, target: 'ENEMY' }],
    keywords: [],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_006',
    version: '1.0.0',
    name: 'Crystal Tonic',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description: 'Gain 8 block.',
    translations: { ja: { name: '結晶薬', description: '8ブロック。' } },
    effects: [{ type: 'GAIN_BLOCK', amount: 8, target: 'SELF' }],
    keywords: [],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_007',
    version: '1.0.0',
    name: 'Transmutation Fluid',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description:
      'Exhaust a card from your hand. Reveal your draw pile, put a card costing no more than it into your hand, then shuffle.',
    translations: {
      ja: {
        name: '変成液',
        description:
          '手札1枚を廃棄する。山札を公開し、そのカード以下のコストのカード1枚を手札へ加え、山札をシャッフルする。',
      },
    },
    effects: [{ type: 'TRANSFORM_HAND_CARD' }],
    keywords: ['alchemy'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_008',
    version: '1.0.0',
    name: 'Unstable Synthesis',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 0,
    type: 'SKILL',
    description: 'Synthesize two materials. Failure grants 2 block.',
    translations: {
      ja: { name: '不安定な合成', description: '素材2枚を合成する。失敗時は2ブロック。' },
    },
    effects: [{ type: 'SYNTHESIZE', mode: 'NORMAL' }],
    keywords: ['alchemy', 'synthesis'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_009',
    version: '1.0.0',
    name: 'Experiment Log',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description: 'Draw once per synthesis this battle, up to 3.',
    translations: {
      ja: { name: '実験記録', description: 'この戦闘の合成回数だけ引く（最大3枚）。' },
    },
    effects: [{ type: 'DRAW_SYNTHESIS_COUNT', maximum: 3 }],
    keywords: ['alchemy'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_011',
    version: '1.0.0',
    name: 'Complete Reaction',
    class: 'ALCHEMIST',
    rarity: 'SR',
    cost: 2,
    type: 'ATTACK',
    description: 'Exhaust three colored reagents and resolve their color effects.',
    translations: {
      ja: { name: '完全反応', description: '色付き試薬3枚を特殊合成し、色別効果を得る。' },
    },
    effects: [{ type: 'SYNTHESIZE', mode: 'COMPLETE_REACTION' }],
    keywords: ['alchemy', 'synthesis'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_013',
    version: '1.0.0',
    name: 'Grand Synthesis',
    class: 'ALCHEMIST',
    rarity: 'UR',
    cost: 3,
    type: 'ATTACK',
    description: 'Exhaust all materials in hand. For each, deal 4 damage and gain 4 block.',
    translations: {
      ja: {
        name: '大錬成',
        description: '手札の全素材を特殊合成し、1枚ごとに4ダメージと4ブロック。',
      },
    },
    effects: [{ type: 'SYNTHESIZE', mode: 'ALL_MATERIALS' }],
    keywords: ['alchemy', 'synthesis'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_014',
    version: '1.0.0',
    name: 'Universal Solvent',
    class: 'ALCHEMIST',
    rarity: 'R',
    cost: 1,
    type: 'SKILL',
    description: 'Draw 1. Universal synthesis material.',
    translations: {
      ja: { name: '万能溶媒', description: '1枚引く。通常合成で素材1種類を代用する素材。' },
    },
    effects: [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    keywords: ['material', 'solvent'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_015',
    version: '1.0.0',
    name: "Sage's Stone Recipe",
    class: 'ALCHEMIST',
    rarity: 'SR',
    cost: 2,
    type: 'SKILL',
    description: 'Synthesize red, blue, and white reagents to begin the Sage Stone.',
    translations: {
      ja: {
        name: '賢者の石のレシピ',
        description: '赤・青・白の試薬を合成し、錬成段階を1にする。',
      },
    },
    effects: [{ type: 'SYNTHESIZE', mode: 'SAGE_RECIPE' }],
    keywords: ['alchemy', 'synthesis'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_016',
    version: '1.0.0',
    name: 'Sage Stone: First Transmutation',
    class: 'ALCHEMIST',
    rarity: 'SR',
    cost: 2,
    type: 'SKILL',
    description: 'At alchemy stage 1, advance to stage 3.',
    translations: { ja: { name: '賢者の石・第一錬成', description: '錬成段階1なら段階3にする。' } },
    effects: [{ type: 'SET_ALCHEMY_STAGE', requiredStage: 1, stage: 3 }],
    keywords: ['alchemy'],
    artwork: null,
    deckLimit: 3,
  },
  {
    id: 'alchemist_017',
    version: '1.0.0',
    name: 'Sage Stone: Complete',
    class: 'ALCHEMIST',
    rarity: 'UR',
    cost: 3,
    type: 'SKILL',
    description: 'At alchemy stage 3, win the battle.',
    translations: { ja: { name: '賢者の石・完成', description: '錬成段階3なら特殊勝利する。' } },
    effects: [
      { type: 'SPECIAL_VICTORY', specialVictoryId: 'ALCHEMY_SAGE_STONE', requiredAlchemyStage: 3 },
    ],
    keywords: ['alchemy'],
    artwork: null,
    deckLimit: 3,
  },
];

export const allCardDefinitions: readonly CardDefinition[] = [
  ...basicCardDefinitions,
  ...packCardDefinitions,
  ...specialVictoryCardDefinitions,
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

    if (!isDense(card.effects)) {
      errors.push({ code: 'INVALID_EFFECT', message: 'Card effects must not be sparse.' });
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
    case 'GAIN_ENERGY':
      return hasPositiveAmount && value.target === 'SELF';
    case 'START_CHANT':
      return (
        Number.isSafeInteger(value.countdown) &&
        (value.countdown as number) > 0 &&
        (value.damageDelay === undefined ||
          (Number.isSafeInteger(value.damageDelay) && (value.damageDelay as number) >= 0)) &&
        Array.isArray(value.completionEffects) &&
        value.completionEffects.length > 0 &&
        isDense(value.completionEffects) &&
        value.completionEffects.every(isValidCardEffect)
      );
    case 'ADVANCE_CHANT':
      return (
        hasPositiveAmount &&
        (value.drawOnComplete === undefined || typeof value.drawOnComplete === 'boolean')
      );
    case 'RESOLVE_ALL_CHANTS':
      return Number.isSafeInteger(value.blockPerChant) && (value.blockPerChant as number) >= 0;
    case 'GAIN_BLOCK_PER_CHANT':
    case 'EXHAUST_GRIMOIRE_ADVANCE_WISH':
      return hasPositiveAmount;
    case 'SYNTHESIZE':
      return (
        value.mode === 'NORMAL' ||
        value.mode === 'SAGE_RECIPE' ||
        value.mode === 'COMPLETE_REACTION' ||
        value.mode === 'ALL_MATERIALS'
      );
    case 'DRAW_SYNTHESIS_COUNT':
      return Number.isSafeInteger(value.maximum) && (value.maximum as number) > 0;
    case 'SET_ALCHEMY_STAGE':
      return value.requiredStage === 1 && value.stage === 3;
    case 'SPECIAL_VICTORY':
      return (
        (value.specialVictoryId === 'MAGE_GRAND_WISH' ||
          value.specialVictoryId === 'ALCHEMY_SAGE_STONE') &&
        (value.requiredAlchemyStage === undefined || value.requiredAlchemyStage === 3)
      );
    case 'REQUEST_CARD_CHOICE':
      return (
        value.from === 'DRAW_PILE' &&
        (value.maximumCost === undefined ||
          (Number.isSafeInteger(value.maximumCost) && (value.maximumCost as number) >= 0))
      );
    case 'TRANSFORM_HAND_CARD':
    case 'SEAL_GRIMOIRE':
      return true;
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
  const seenDefinitionVersions = new Set<string>();

  if (!Array.isArray(cards)) {
    return invalidDefinitionResult('Card definitions must be an array.');
  }

  for (const card of cards) {
    if (isRecord(card) && typeof card.id === 'string' && typeof card.version === 'string') {
      const definitionKey = `${card.id}\u0000${card.version}`;
      if (seenDefinitionVersions.has(definitionKey)) {
        errors.push({
          code: 'DUPLICATE_ID',
          message: `Card definition is duplicated: ${card.id}@${card.version}.`,
        });
      }

      seenDefinitionVersions.add(definitionKey);
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

function isDense(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) return false;
  }
  return true;
}

function invalidDefinitionResult(
  message = 'Card definition must be an object.',
): CardDefinitionValidationResult {
  return { ok: false, errors: [{ code: 'INVALID_DEFINITION', message }] };
}
