export interface RankPresentationConfig {
  readonly version: string;
  readonly bands: readonly { readonly name: string; readonly floor: number }[];
  readonly divisions: readonly string[];
  readonly rrPerDivision: number;
  readonly finalBandWidth: number;
}

/** Changes to these display thresholds require a new version and updated UI documentation. */
export const rankPresentationConfig: RankPresentationConfig = {
  version: 'rank-display-v1',
  bands: [
    { name: 'BRONZE', floor: 0 },
    { name: 'SILVER', floor: 1200 },
    { name: 'GOLD', floor: 1400 },
    { name: 'PLATINUM', floor: 1600 },
    { name: 'DIAMOND', floor: 1800 },
    { name: 'MASTER', floor: 2000 },
    { name: 'GRAND_MASTER', floor: 2200 },
  ],
  divisions: ['III', 'II', 'I'],
  rrPerDivision: 100,
  finalBandWidth: 300,
};
