import { readFileSync } from 'node:fs';

import { createInitialBattleState, recordReplay } from './index.js';
import type {
  CardDefinition,
  CardInstance,
  CardInstanceId,
  GameAction,
  MatchId,
  PlayerId,
  Replay,
} from './index.js';

export interface ReplayFixture {
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
    readonly checksum: Replay['checksum'];
    readonly events: Replay['events'];
    readonly snapshots: Replay['snapshots'];
    readonly finalState: Replay['finalState'];
  };
}

const fixturePath = new URL(
  '../../../tests/fixtures/replays/phase-2-recording.json',
  import.meta.url,
);

export const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ReplayFixture;

export const definitions: readonly CardDefinition[] = [
  { id: 'strike', cost: 1, effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }] },
  { id: 'guard', cost: 1, effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }] },
];

export function initialState() {
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

export function successfulReplay(): Replay {
  const result = recordReplay(initialState(), fixture.actions, definitions, {
    snapshotInterval: 2,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

export function zeroActionReplay(): Replay {
  const result = recordReplay(initialState(), [], definitions);
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

export function expectedReplay(): Replay {
  const initialSnapshot = fixture.expectedReplay.snapshots.at(0);
  if (initialSnapshot === undefined)
    throw new Error('Replay fixture must include an initial snapshot.');

  return {
    formatVersion: 1,
    matchId: fixture.matchId as MatchId,
    engineVersion: fixture.engineVersion,
    rulesVersion: fixture.rulesVersion,
    cardDataVersion: fixture.cardDataVersion,
    seed: fixture.seed,
    initialState: {
      ...initialSnapshot.state,
      events: fixture.expectedReplay.events.slice(0, initialSnapshot.eventSequence),
    },
    actions: fixture.actions,
    events: fixture.expectedReplay.events,
    snapshots: fixture.expectedReplay.snapshots,
    finalState: fixture.expectedReplay.finalState,
    snapshotInterval: 2,
    checksum: fixture.expectedReplay.checksum,
  };
}
