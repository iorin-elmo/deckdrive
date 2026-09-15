import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createInitialBattleState, recordReplay, verifyReplay } from './index.js';
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

function replayFromFixture(): Replay {
  const initialState = createInitialBattleState({
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
  const recorded = recordReplay(initialState, fixture.actions, definitions, {
    snapshotInterval: 2,
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.replay;
}

function goldenOutput(replay: Replay) {
  return {
    checksum: replay.checksum,
    events: replay.events,
    snapshots: replay.snapshots,
    finalState: replay.finalState,
  };
}

describe('Replay regression gate', () => {
  it('reproduces the known Phase 2 replay fixture exactly', () => {
    const replay = replayFromFixture();

    expect(goldenOutput(replay)).toEqual(fixture.expectedReplay);
    expect(verifyReplay(replay, definitions)).toEqual({ ok: true });
  });

  it('fails when the expected replay result is deliberately changed', () => {
    const replay = replayFromFixture();
    const intentionallyIncorrectGolden = {
      ...fixture.expectedReplay,
      checksum: 'fnv1a-32:00000000',
    };

    expect(() => expect(goldenOutput(replay)).toEqual(intentionallyIncorrectGolden)).toThrow();
  });
});
