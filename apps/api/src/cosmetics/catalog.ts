export interface CosmeticCatalogEntry {
  readonly id: string;
  readonly kind:
    | 'CARD_FRAME'
    | 'CARD_FULL_ART_FX'
    | 'CARD_ANIMATION'
    | 'HOLOGRAM'
    | 'LEADER_SKIN'
    | 'PLAYMAT'
    | 'CARD_SLEEVE'
    | 'TITLE'
    | 'PROFILE_DECORATION';
  readonly name: string;
  readonly description: string;
}

/** Presentation-only cosmetics. These identifiers are deliberately absent from game-engine state. */
export const cosmeticCatalog: readonly CosmeticCatalogEntry[] = [
  {
    id: 'frame.aurora',
    kind: 'CARD_FRAME',
    name: 'Aurora Frame',
    description: 'A cool cyan card frame.',
  },
  {
    id: 'art.starlight',
    kind: 'CARD_FULL_ART_FX',
    name: 'Starlight',
    description: 'A subtle full-art starlight effect.',
  },
  {
    id: 'animation.comet',
    kind: 'CARD_ANIMATION',
    name: 'Comet',
    description: 'A card entrance animation.',
  },
  {
    id: 'hologram.prism',
    kind: 'HOLOGRAM',
    name: 'Prism',
    description: 'A holographic card finish.',
  },
  {
    id: 'leader.vanguard',
    kind: 'LEADER_SKIN',
    name: 'Vanguard',
    description: 'A leader portrait skin.',
  },
  {
    id: 'playmat.observatory',
    kind: 'PLAYMAT',
    name: 'Observatory',
    description: 'A night-sky playmat.',
  },
  {
    id: 'sleeve.circuit',
    kind: 'CARD_SLEEVE',
    name: 'Circuit',
    description: 'A circuit-pattern card sleeve.',
  },
  { id: 'title.pathfinder', kind: 'TITLE', name: 'Pathfinder', description: 'A profile title.' },
  {
    id: 'profile.signal',
    kind: 'PROFILE_DECORATION',
    name: 'Signal',
    description: 'A profile decoration.',
  },
];

/** Login rewards grant this presentation-only item on day five of the seven-day cycle. */
export function loginCosmeticForCycleDay(cycleDay: number): string | undefined {
  return cycleDay === 5 ? 'frame.aurora' : undefined;
}
