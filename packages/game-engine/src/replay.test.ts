import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  calculateReplayChecksum,
  createInitialBattleState,
  recordReplay,
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

function withChecksum(content: Omit<Replay, 'checksum'>): Replay {
  return { ...content, checksum: calculateReplayChecksum(content) };
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
    expect(replay.events).toEqual(replay.finalState.events);
    expect(replay.snapshots.map((entry) => entry.actionIndex)).toEqual([0, 2, 3]);
    expect(replay.snapshots.at(-1)?.state).toEqual(replay.finalState);
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
});
