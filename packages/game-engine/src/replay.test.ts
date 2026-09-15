import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  calculateReplayChecksum,
  createInitialBattleState,
  recordReplay,
  restoreReplaySnapshot,
  verifyReplay,
} from './index.js';
import type {
  CardDefinition,
  CardInstance,
  CardInstanceId,
  GameAction,
  MatchId,
  PlayerId,
  Replay,
} from './index.js';

interface ReplayFixture {
  readonly matchId: string;
  readonly seed: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly initialDrawCount: number;
  readonly turnDrawCount: number;
  readonly players: readonly {
    readonly id: string;
    readonly cards: readonly { readonly id: string; readonly definitionId: string }[];
  }[];
  readonly actions: readonly GameAction[];
  readonly expectedReplay: {
    readonly checksum: string;
    readonly events: readonly unknown[];
    readonly snapshots: readonly unknown[];
    readonly finalState: unknown;
  };
}

const fixturePath = new URL(
  '../../../tests/fixtures/replays/phase-2-recording.json',
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ReplayFixture;
const definitions: readonly CardDefinition[] = [
  { id: 'strike', cost: 1, effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }] },
  { id: 'guard', cost: 1, effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }] },
];

function initialState() {
  return createInitialBattleState({
    matchId: fixture.matchId as MatchId,
    seed: fixture.seed,
    engineVersion: fixture.engineVersion,
    rulesVersion: fixture.rulesVersion,
    cardDataVersion: fixture.cardDataVersion,
    initialDrawCount: fixture.initialDrawCount,
    turnDrawCount: fixture.turnDrawCount,
    players: fixture.players.map((player) => ({
      id: player.id as PlayerId,
      drawPile: player.cards.map((card): CardInstance => ({
        id: card.id as CardInstanceId,
        definitionId: card.definitionId,
      })),
    })),
  });
}

function successfulReplay(): Replay {
  const result = recordReplay(initialState(), fixture.actions, definitions, {
    snapshotInterval: 2,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

function zeroActionReplay(): Replay {
  const result = recordReplay(initialState(), [], definitions);
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

function withChecksum(content: Omit<Replay, 'checksum'>): Replay {
  return { ...content, checksum: calculateReplayChecksum(content) };
}

function rebuildZeroActionReplay(replay: Replay, initialState: Replay['initialState']): Replay {
  const { events, ...snapshotState } = initialState;
  return withChecksum({
    ...replay,
    initialState,
    events,
    snapshots: [
      {
        actionIndex: 0,
        eventSequence: events.at(-1)?.sequence ?? 0,
        state: snapshotState,
      },
    ],
    finalState: initialState,
  });
}

describe('Replay recording', () => {
  it('records versions, seed, all decisions and events, snapshots, and final state', () => {
    const replay = successfulReplay();

    expect(replay).toMatchObject({
      formatVersion: 1,
      matchId: fixture.matchId,
      seed: fixture.seed,
      engineVersion: fixture.engineVersion,
      rulesVersion: fixture.rulesVersion,
      cardDataVersion: fixture.cardDataVersion,
      actions: fixture.actions,
    });
    expect({
      checksum: replay.checksum,
      events: replay.events,
      snapshots: replay.snapshots,
      finalState: replay.finalState,
    }).toEqual(fixture.expectedReplay);
    expect(replay.events).toEqual(replay.finalState.events);
    expect(replay.snapshots.map((entry) => entry.actionIndex)).toEqual([0, 2, 3]);
    expect(replay.snapshots.every((entry) => !('events' in entry.state))).toBe(true);
    expect(restoreReplaySnapshot(replay.snapshots.at(-1)!, replay.events)).toEqual(
      replay.finalState,
    );
    expect(verifyReplay(replay, definitions)).toEqual({ ok: true });
  });

  it('rejects an invalid recorded decision without returning a partial replay', () => {
    const result = recordReplay(
      initialState(),
      [{ type: 'END_TURN', playerId: 'not-a-player' as PlayerId }],
      definitions,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'ACTION_REJECTED', actionIndex: 0 },
    });
  });

  it('detects changed stored content with its checksum', () => {
    const replay = successfulReplay();
    const tampered = {
      ...replay,
      finalState: { ...replay.finalState, seed: 'changed-after-recording' },
    };

    expect(verifyReplay(tampered, definitions)).toMatchObject({
      ok: false,
      error: { code: 'CHECKSUM_MISMATCH' },
    });
  });

  it('detects inconsistent events even when persisted content has a recalculated checksum', () => {
    const replay = successfulReplay();
    const tampered = withChecksum({
      ...replay,
      events: replay.events.slice(1),
    });

    expect(verifyReplay(tampered, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('rejects a replay format version that this engine does not support', () => {
    const replay = successfulReplay();
    const tampered = withChecksum({ ...replay, formatVersion: 2 as 1 });

    expect(verifyReplay(tampered, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('records an optional targetId explicitly set to undefined', () => {
    const actions: readonly GameAction[] = [
      ...fixture.actions.slice(0, 2),
      {
        type: 'PLAY_CARD',
        playerId: 'player-2' as PlayerId,
        cardInstanceId: 'player-2-guard' as CardInstanceId,
        targetId: undefined,
      } as unknown as GameAction,
    ];
    const result = recordReplay(initialState(), actions, definitions, { snapshotInterval: 2 });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(verifyReplay(result.replay, definitions)).toEqual({ ok: true });
  });

  it('returns a verification failure for malformed persisted content', () => {
    const replay = successfulReplay();
    const corrupt = { ...replay } as Record<string, unknown>;
    delete corrupt.events;

    expect(verifyReplay(corrupt as unknown as Replay, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('rejects malformed nested state even with a recalculated checksum', () => {
    const replay = successfulReplay();
    const corrupt = withChecksum({
      ...replay,
      initialState: {
        matchId: replay.matchId,
        engineVersion: replay.engineVersion,
        rulesVersion: replay.rulesVersion,
        cardDataVersion: replay.cardDataVersion,
        seed: replay.seed,
        events: [],
      } as unknown as Replay['initialState'],
    });

    expect(verifyReplay(corrupt, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('rejects a replay state that does not have exactly two players', () => {
    const replay = successfulReplay();
    const corrupt = withChecksum({
      ...replay,
      initialState: { ...replay.initialState, players: replay.initialState.players.slice(0, 1) },
    });

    expect(verifyReplay(corrupt, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('rejects duplicate player and card instance IDs in persisted state', () => {
    const replay = zeroActionReplay();
    const [firstPlayer, secondPlayer] = replay.initialState.players;
    const card = firstPlayer?.drawPile[0];
    if (firstPlayer === undefined || secondPlayer === undefined || card === undefined) {
      throw new Error('Replay fixture must have two players and a card.');
    }
    const duplicatePlayerId = rebuildZeroActionReplay(replay, {
      ...replay.initialState,
      players: [firstPlayer, { ...secondPlayer, id: firstPlayer.id }],
    });
    const duplicateCardId = rebuildZeroActionReplay(replay, {
      ...replay.initialState,
      players: [{ ...firstPlayer, drawPile: [...firstPlayer.drawPile, card] }, secondPlayer],
    });

    for (const corrupt of [duplicatePlayerId, duplicateCardId]) {
      expect(verifyReplay(corrupt, definitions)).toMatchObject({
        ok: false,
        error: { code: 'REPLAY_MISMATCH' },
      });
    }
  });

  it('rejects an out-of-order persisted event stream with a recalculated checksum', () => {
    const replay = zeroActionReplay();
    const reorderedState = {
      ...replay.initialState,
      events: [...replay.initialState.events].reverse(),
    };
    const corrupt = rebuildZeroActionReplay(replay, reorderedState);

    expect(verifyReplay(corrupt, definitions)).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('uses UTF-8 bytes for checksums containing non-ASCII metadata', () => {
    const state = initialState();
    const result = recordReplay(
      { ...state, matchId: '試合-一' as MatchId, seed: 'シード' },
      fixture.actions,
      definitions,
      { snapshotInterval: 2 },
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.replay.checksum).toBe('fnv1a-32:dbdded95');
  });
});
