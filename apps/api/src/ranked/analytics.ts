export interface RankedPlayerFact {
  readonly playerId: string;
  readonly outcome: 'WIN' | 'LOSS' | 'DRAW' | null;
  readonly damageRatio: number | null;
  readonly ratingDelta: number | null;
  readonly disconnectCount: number;
  readonly deckKey: string | null;
  readonly classes: readonly string[];
  readonly cards: readonly string[];
}

export interface RankedMatchFact {
  readonly matchId: string;
  readonly seasonId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly status: 'COMPLETED' | 'ABANDONED';
  readonly turnCount: number;
  readonly players: readonly [RankedPlayerFact, RankedPlayerFact];
}

export interface PackFact {
  readonly openingId: string;
  readonly product: string;
  readonly rarities: readonly string[];
  readonly duplicateCount: number;
}

export interface AbuseThresholds {
  readonly version: string;
  readonly opponentWindowMs: number;
  readonly repeatMatches: number;
  readonly intentionalLosses: number;
  readonly shortMatchTurns: number;
  readonly lowDamageRatio: number;
  readonly farmingLosses: number;
  readonly highDamageRatio: number;
  readonly boostingWins: number;
  readonly boostingRatingGain: number;
  readonly disconnects: number;
}

export const abuseThresholds: AbuseThresholds = Object.freeze({
  version: 'ranked-abuse-v1',
  opponentWindowMs: 60 * 60 * 1000,
  repeatMatches: 4,
  intentionalLosses: 3,
  shortMatchTurns: 3,
  lowDamageRatio: 0.05,
  farmingLosses: 3,
  highDamageRatio: 0.85,
  boostingWins: 4,
  boostingRatingGain: 40,
  disconnects: 3,
});

export interface AbuseSignal {
  readonly matchId: string;
  readonly playerId: string;
  readonly type:
    'REPEAT_OPPONENT' | 'INTENTIONAL_LOSS' | 'DAMAGE_FARMING' | 'DISCONNECT_ABUSE' | 'BOOSTING';
  readonly evidence: {
    readonly seasonId: string;
    readonly matchIds: readonly string[];
    readonly thresholdVersion: string;
    readonly observed: number;
    readonly threshold: number;
  };
}

/** Only completed, server-settled results can support rating-related signals. */
export function detectAbuseSignals(
  facts: readonly RankedMatchFact[],
  thresholds: AbuseThresholds = abuseThresholds,
): readonly AbuseSignal[] {
  const ordered = [...facts].sort(
    (a, b) =>
      a.completedAt.getTime() - b.completedAt.getTime() || a.matchId.localeCompare(b.matchId),
  );
  const signals: AbuseSignal[] = [];
  const recentByPair = new Map<string, readonly RankedMatchFact[]>();
  for (const fact of ordered) {
    const pairKey = `${fact.seasonId}:${fact.players
      .map((player) => player.playerId)
      .sort()
      .join(':')}`;
    const paired =
      fact.status === 'COMPLETED'
        ? [
            ...(recentByPair.get(pairKey) ?? []).filter(
              (previous) =>
                previous.completedAt.getTime() >
                fact.completedAt.getTime() - thresholds.opponentWindowMs,
            ),
            fact,
          ]
        : [];
    if (fact.status === 'COMPLETED') recentByPair.set(pairKey, paired);
    for (const player of fact.players) {
      const emit = (
        type: AbuseSignal['type'],
        matches: readonly RankedMatchFact[],
        observed: number,
        threshold: number,
      ) =>
        signals.push({
          matchId: fact.matchId,
          playerId: player.playerId,
          type,
          evidence: {
            seasonId: fact.seasonId,
            matchIds: matches.map((entry) => entry.matchId),
            thresholdVersion: thresholds.version,
            observed,
            threshold,
          },
        });
      if (
        player.disconnectCount >= thresholds.disconnects ||
        (fact.status === 'ABANDONED' && player.disconnectCount > 0)
      )
        emit('DISCONNECT_ABUSE', [fact], player.disconnectCount, thresholds.disconnects);
      if (fact.status !== 'COMPLETED') continue;
      if (paired.length >= thresholds.repeatMatches)
        emit('REPEAT_OPPONENT', paired, paired.length, thresholds.repeatMatches);
      const losses = paired.filter(
        (entry) =>
          entry.players.find((seat) => seat.playerId === player.playerId)?.outcome === 'LOSS',
      );
      const shortLosses = losses.filter(
        (entry) =>
          entry.turnCount <= thresholds.shortMatchTurns &&
          (entry.players.find((seat) => seat.playerId === player.playerId)?.damageRatio ??
            Infinity) <= thresholds.lowDamageRatio,
      );
      if (
        player.outcome === 'LOSS' &&
        shortLosses.length >= thresholds.intentionalLosses &&
        shortLosses.includes(fact)
      )
        emit('INTENTIONAL_LOSS', shortLosses, shortLosses.length, thresholds.intentionalLosses);
      const farmingLosses = losses.filter(
        (entry) =>
          (entry.players.find((seat) => seat.playerId === player.playerId)?.damageRatio ?? -1) >=
          thresholds.highDamageRatio,
      );
      if (
        player.outcome === 'LOSS' &&
        farmingLosses.length >= thresholds.farmingLosses &&
        farmingLosses.includes(fact)
      )
        emit('DAMAGE_FARMING', farmingLosses, farmingLosses.length, thresholds.farmingLosses);
      const wins = paired.filter(
        (entry) =>
          entry.players.find((seat) => seat.playerId === player.playerId)?.outcome === 'WIN',
      );
      const gain = wins.reduce(
        (total, entry) =>
          total +
          (entry.players.find((seat) => seat.playerId === player.playerId)?.ratingDelta ?? 0),
        0,
      );
      if (
        player.outcome === 'WIN' &&
        wins.length >= thresholds.boostingWins &&
        gain >= thresholds.boostingRatingGain
      )
        emit('BOOSTING', wins, gain, thresholds.boostingRatingGain);
    }
  }
  return signals;
}

export interface UsageMetric {
  readonly key: string;
  readonly uses: number;
  readonly wins: number;
  readonly winRate: number;
}

export function buildRankedReport(facts: readonly RankedMatchFact[], packs: readonly PackFact[]) {
  const completed = facts.filter((fact) => fact.status === 'COMPLETED');
  const seats = completed.flatMap((fact) => fact.players);
  const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
  const usage = (select: (player: RankedPlayerFact) => readonly string[]): UsageMetric[] => {
    const metrics = new Map<string, { uses: number; wins: number }>();
    for (const player of seats)
      for (const key of new Set(select(player))) {
        const current = metrics.get(key) ?? { uses: 0, wins: 0 };
        current.uses += 1;
        if (player.outcome === 'WIN') current.wins += 1;
        metrics.set(key, current);
      }
    return [...metrics]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, metric]) => ({
        key,
        ...metric,
        winRate: metric.wins / metric.uses,
      }));
  };
  const distribution = (values: readonly string[]) =>
    Object.fromEntries(
      [...new Set(values)]
        .sort()
        .map((key) => [key, values.filter((value) => value === key).length]),
    );
  const packCards = packs.flatMap((pack) => pack.rarities);
  return {
    completedMatches: completed.length,
    abandonedMatches: facts.length - completed.length,
    averageLengthSeconds:
      completed.length === 0
        ? null
        : total(
            completed.map((fact) => (fact.completedAt.getTime() - fact.startedAt.getTime()) / 1000),
          ) / completed.length,
    averageTurns:
      completed.length === 0
        ? null
        : total(completed.map((fact) => fact.turnCount)) / completed.length,
    surrenderCount: null as null, // The current game protocol has no surrender action.
    disconnectCount: total(
      facts.flatMap((fact) => fact.players.map((player) => player.disconnectCount)),
    ),
    ratingChanges: {
      count: seats.length,
      total: total(seats.map((seat) => seat.ratingDelta ?? 0)),
      averageAbsolute:
        seats.length === 0
          ? null
          : total(seats.map((seat) => Math.abs(seat.ratingDelta ?? 0))) / seats.length,
    },
    classes: usage((seat) => seat.classes),
    cards: usage((seat) => seat.cards),
    decks: usage((seat) => (seat.deckKey === null ? [] : [seat.deckKey])),
    packs: {
      openings: packs.length,
      products: distribution(packs.map((pack) => pack.product)),
      rarities: distribution(packCards),
      duplicateCards: total(packs.map((pack) => pack.duplicateCount)),
      duplicateRate:
        packCards.length === 0
          ? null
          : total(packs.map((pack) => pack.duplicateCount)) / packCards.length,
    },
  };
}
