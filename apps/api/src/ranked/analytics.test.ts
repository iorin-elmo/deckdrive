import { describe, expect, it } from 'vitest';
import {
  abuseThresholds,
  buildRankedReport,
  detectAbuseSignals,
  type RankedMatchFact,
} from './analytics.js';

const start = new Date('2026-01-01T00:00:00Z');
function match(index: number, outcome: 'WIN' | 'LOSS' = 'LOSS', damageRatio = 0): RankedMatchFact {
  return {
    matchId: `match-${index}`,
    seasonId: 'season-1',
    startedAt: new Date(start.getTime() + index * 60_000),
    completedAt: new Date(start.getTime() + index * 60_000 + 30_000),
    status: 'COMPLETED',
    turnCount: 2,
    players: [
      {
        playerId: 'one',
        outcome,
        damageRatio,
        ratingDelta: outcome === 'WIN' ? 20 : -10,
        disconnectCount: 0,
        deckKey: 'deck-fingerprint',
        classes: ['SWORD'],
        cards: ['strike'],
      },
      {
        playerId: 'two',
        outcome: outcome === 'WIN' ? 'LOSS' : 'WIN',
        damageRatio: 1 - damageRatio,
        ratingDelta: outcome === 'WIN' ? -10 : 20,
        disconnectCount: 0,
        deckKey: null,
        classes: ['MAGE'],
        cards: ['spell'],
      },
    ],
  };
}

describe('ranked signals and analytics', () => {
  it('traces repeated opponents, short intentional losses, farming and boosting to season and matches', () => {
    const losses = [0, 1, 2].map((index) => match(index));
    const signals = detectAbuseSignals(losses);
    expect(signals.find((signal) => signal.type === 'INTENTIONAL_LOSS')).toMatchObject({
      matchId: 'match-2',
      playerId: 'one',
      evidence: {
        seasonId: 'season-1',
        matchIds: ['match-0', 'match-1', 'match-2'],
        thresholdVersion: abuseThresholds.version,
      },
    });
    expect(
      detectAbuseSignals([0, 1, 2].map((index) => match(index, 'LOSS', 0.9))).some(
        (signal) => signal.type === 'DAMAGE_FARMING',
      ),
    ).toBe(true);
    const fourWins = [0, 1, 2, 3].map((index) => match(index, 'WIN'));
    expect(
      detectAbuseSignals(fourWins)
        .filter((signal) => signal.matchId === 'match-3')
        .map((signal) => signal.type),
    ).toContain('BOOSTING');
    expect(
      detectAbuseSignals(fourWins).filter((signal) => signal.type === 'REPEAT_OPPONENT'),
    ).toHaveLength(2);
  });

  it('keeps other seasons and old matches out of the opponent window', () => {
    const separated = [match(0), match(1), match(2), { ...match(3), seasonId: 'season-2' }];
    expect(detectAbuseSignals(separated).some((signal) => signal.type === 'REPEAT_OPPONENT')).toBe(
      false,
    );
    const old = { ...match(0), completedAt: new Date(start.getTime() - 2 * 60 * 60 * 1000) };
    expect(
      detectAbuseSignals([old, match(1), match(2), match(3)]).some(
        (signal) => signal.type === 'REPEAT_OPPONENT',
      ),
    ).toBe(false);
  });

  it('reports abandonment disconnects without inventing settled rating or surrender', () => {
    const abandoned: RankedMatchFact = {
      ...match(1),
      status: 'ABANDONED',
      players: [
        { ...match(1).players[0], outcome: null, ratingDelta: null, disconnectCount: 1 },
        { ...match(1).players[1], outcome: null, ratingDelta: null },
      ],
    };
    expect(detectAbuseSignals([abandoned]).map((signal) => signal.type)).toEqual([
      'DISCONNECT_ABUSE',
    ]);
    const report = buildRankedReport(
      [match(0), abandoned],
      [{ openingId: 'pack-1', product: 'NORMAL_PACK', rarities: ['N', 'R'], duplicateCount: 1 }],
    );
    expect(report).toMatchObject({
      completedMatches: 1,
      abandonedMatches: 1,
      averageLengthSeconds: 30,
      averageTurns: 2,
      surrenderCount: null,
      disconnectCount: 1,
      ratingChanges: { count: 2, total: 10, averageAbsolute: 15 },
      classes: [
        { key: 'MAGE', uses: 1, wins: 1, winRate: 1 },
        { key: 'SWORD', uses: 1, wins: 0, winRate: 0 },
      ],
      cards: [
        { key: 'spell', uses: 1, wins: 1, winRate: 1 },
        { key: 'strike', uses: 1, wins: 0, winRate: 0 },
      ],
      decks: [{ key: 'deck-fingerprint', uses: 1, wins: 0, winRate: 0 }],
      packs: {
        openings: 1,
        products: { NORMAL_PACK: 1 },
        rarities: { N: 1, R: 1 },
        duplicateCards: 1,
        duplicateRate: 0.5,
      },
    });
    expect(JSON.stringify(report)).not.toContain('playerId');
    expect(JSON.stringify(report)).not.toContain('match-');
  });

  it('returns an explicit empty report without dividing by zero', () => {
    expect(buildRankedReport([], [])).toMatchObject({
      completedMatches: 0,
      abandonedMatches: 0,
      averageLengthSeconds: null,
      averageTurns: null,
      ratingChanges: { count: 0, total: 0, averageAbsolute: null },
      packs: { openings: 0, duplicateRate: null },
    });
  });
});
