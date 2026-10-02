/** Display policy shared by the ranked API and the ranked UI. */
export const rankDisplayConfig = {
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
  grandMasterDisplayWidth: 300,
} as const;

export type RankName = (typeof rankDisplayConfig.bands)[number]['name'];
export type RankDivision = (typeof rankDisplayConfig.divisions)[number];

export function rankProgress(rating: number): {
  readonly name: RankName;
  readonly division: RankDivision;
  readonly rr: number;
} {
  const { bands, divisions, rrPerDivision, grandMasterDisplayWidth } = rankDisplayConfig;
  const index = Math.max(
    0,
    bands.findLastIndex((band) => rating >= band.floor),
  );
  const band = bands[index]!;
  const nextFloor = bands[index + 1]?.floor ?? band.floor + grandMasterDisplayWidth;
  const fraction = Math.min(
    0.999999,
    Math.max(0, (rating - band.floor) / (nextFloor - band.floor)),
  );
  const divisionIndex = Math.floor(fraction * divisions.length);
  return {
    name: band.name,
    division: divisions[divisionIndex]!,
    rr: Math.floor((fraction * divisions.length - divisionIndex) * rrPerDivision),
  };
}
