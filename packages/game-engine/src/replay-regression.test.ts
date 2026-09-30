import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  calculateDraftDefinitionRevision,
  calculatePlayerReplayProjectionChecksumV2,
  projectReplayV2,
  recordReplayV2,
  verifyReplay,
  verifyReplayV2,
  verifyPlayerReplayViewV2,
} from './index.js';
import type { BattleInput, BattleStateV2, CardDefinitionV2, Replay, ReplayV2 } from './index.js';
import { definitions, expectedReplay, successfulReplay } from './replay.test-support.js';

function assertReplayMatchesGolden(replay: Replay, golden: Replay): void {
  expect(replay).toEqual(golden);
}

describe('Replay regression gate', () => {
  it('reproduces the known Phase 2 replay fixture exactly', () => {
    const replay = successfulReplay();

    assertReplayMatchesGolden(replay, expectedReplay());
    expect(verifyReplay(replay, definitions)).toEqual({ ok: true });
  });

  it('fails when the expected replay result is deliberately changed', () => {
    const replay = successfulReplay();
    const intentionallyIncorrectGolden = {
      ...expectedReplay(),
      checksum: 'fnv1a-32:00000000',
    };

    expect(() => assertReplayMatchesGolden(replay, intentionallyIncorrectGolden)).toThrow();
  });

  it('reproduces the protocol 2 golden replay with server commands and special victory', () => {
    const result = recordReplayV2(v2Fixture.initial, v2Fixture.inputs, v2Fixture.definitions, {
      draftDefinitionRevision: calculateDraftDefinitionRevision(v2Fixture.definitions),
      battleProtocolVersion: 2,
      snapshotInterval: 1,
      authorizeServerCommand: () => true,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.replay).toEqual(v2Fixture.expectedReplay);
    expect(result.replay.serverCommands).toHaveLength(1);
    expect(result.replay.finalState.terminalResult).toMatchObject({
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'MAGE_GRAND_WISH',
    });
    expect(
      verifyReplayV2(
        result.replay,
        () => v2Fixture.definitions,
        () => true,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects a persisted shuffle event without its RNG audit fields', () => {
    const malformed = structuredClone(v2Fixture.expectedReplay);
    const shuffle = malformed.events.find((event) => event.type === 'DECK_SHUFFLED');
    if (shuffle === undefined) throw new Error('The golden replay must include a shuffle.');
    delete (shuffle as Record<string, unknown>).rngStateAfter;
    expect(
      verifyReplayV2(
        malformed,
        () => v2Fixture.definitions,
        () => true,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('projects a validated replay separately for both players and rejects private data', () => {
    for (const player of v2Fixture.initial.players) {
      const view = projectReplayV2(
        v2Fixture.expectedReplay,
        () => v2Fixture.definitions,
        () => true,
        player.id,
      );
      expect(verifyPlayerReplayViewV2(view)).toEqual({ ok: true });
      const serialized = JSON.stringify(view);
      expect(serialized).not.toMatch(/"(?:seed|rngState|serverCommands|timeoutAuthorization)"/);
      const tampered = structuredClone(view);
      (tampered.finalState as Record<string, unknown>).seed = 'private';
      (tampered as { projectionChecksum: string }).projectionChecksum =
        calculatePlayerReplayProjectionChecksumV2(tampered);
      expect(verifyPlayerReplayViewV2(tampered)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PROJECTION' },
      });
    }
  });

  it('rejects reordered, repeated, zero, or incomplete projected actions', () => {
    const view = projectReplayV2(
      v2Fixture.expectedReplay,
      () => v2Fixture.definitions,
      () => true,
      v2Fixture.initial.players[0]!.id,
    );
    const invalidViews = [
      (copy: typeof view) => {
        (copy.actions[0] as { inputSequence: number }).inputSequence = 0;
      },
      (copy: typeof view) => {
        (copy.actions[1] as { inputSequence: number }).inputSequence = 1;
      },
      (copy: typeof view) => {
        (copy.actions[1] as { inputSequence: number }).inputSequence = 10;
        (copy.actions[2] as { inputSequence: number }).inputSequence = 9;
      },
      (copy: typeof view) => {
        delete (copy.actions[0]!.payload as Record<string, unknown>).cardInstanceId;
      },
    ];
    for (const change of invalidViews) {
      const copy = structuredClone(view);
      change(copy);
      (copy as { projectionChecksum: string }).projectionChecksum =
        calculatePlayerReplayProjectionChecksumV2(copy);
      expect(verifyPlayerReplayViewV2(copy)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PROJECTION' },
      });
    }
  });

  it('rejects incomplete projected states and snapshots with mismatched boundaries', () => {
    const view = projectReplayV2(
      v2Fixture.expectedReplay,
      () => v2Fixture.definitions,
      () => true,
      v2Fixture.initial.players[0]!.id,
    );
    const invalidViews = [
      (copy: typeof view) => {
        delete copy.snapshots[1]!.state.matchId;
      },
      (copy: typeof view) => {
        delete copy.snapshots[1]!.state.battleProtocolVersion;
      },
      (copy: typeof view) => {
        delete copy.snapshots[1]!.state.lastInputSequence;
      },
      (copy: typeof view) => {
        delete copy.snapshots[1]!.state.chantEntrySequence;
      },
      (copy: typeof view) => {
        copy.snapshots[1]!.state.lastInputSequence = 99;
      },
      (copy: typeof view) => {
        copy.snapshots[1]!.state.matchId = 'other-match';
      },
      (copy: typeof view) => {
        delete copy.finalState.phase;
      },
      (copy: typeof view) => {
        delete (copy.initialState.players as Record<string, unknown>[])[0]!.hp;
      },
    ];
    for (const change of invalidViews) {
      const copy = structuredClone(view);
      change(copy);
      (copy as { projectionChecksum: string }).projectionChecksum =
        calculatePlayerReplayProjectionChecksumV2(copy);
      expect(verifyPlayerReplayViewV2(copy)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PROJECTION' },
      });
    }
  });

  it('rejects malformed projected events even with a recalculated checksum', () => {
    const view = projectReplayV2(
      v2Fixture.expectedReplay,
      () => v2Fixture.definitions,
      () => true,
      v2Fixture.initial.players[0]!.id,
    );
    const malformedEvents: Record<string, unknown>[] = [
      { sequence: 1 },
      {
        type: 'CARD_DRAWN',
        sequence: 1,
        playerId: 'golden-player-two',
        cardInstanceId: 'private-opponent-card',
      },
      {
        type: 'CARD_DRAWN',
        sequence: 1,
        playerId: 'golden-player-two',
        cardInstanceId: 'private-opponent-card',
        visibility: 'ownerOnly',
      },
      { type: 'CARD_DRAWN', sequence: 1, visibility: 'ownerOnly', redacted: true },
    ];
    for (const malformed of malformedEvents) {
      const copy = structuredClone(view);
      (copy.events as Record<string, unknown>[])[0] = malformed;
      (copy.finalState.events as Record<string, unknown>[])[0] = structuredClone(malformed);
      (copy.initialState.events as Record<string, unknown>[])[0] = structuredClone(malformed);
      (copy as { projectionChecksum: string }).projectionChecksum =
        calculatePlayerReplayProjectionChecksumV2(copy);
      expect(verifyPlayerReplayViewV2(copy)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_PROJECTION' },
      });
    }
  });

  it('rejects a projected initial event history that is not the replay prefix', () => {
    const view = projectReplayV2(
      v2Fixture.expectedReplay,
      () => v2Fixture.definitions,
      () => true,
      v2Fixture.initial.players[0]!.id,
    );
    const copy = structuredClone(view);
    const initialEvents = copy.initialState.events as Record<string, unknown>[];
    initialEvents[0] = { ...initialEvents[0]!, cardInstanceId: 'different-card' };
    (copy as { projectionChecksum: string }).projectionChecksum =
      calculatePlayerReplayProjectionChecksumV2(copy);
    expect(verifyPlayerReplayViewV2(copy)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PROJECTION' },
    });
  });
});

const v2Fixture = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/replays/phase-51-protocol-v2.json', import.meta.url),
    'utf8',
  ),
) as {
  readonly definitions: readonly CardDefinitionV2[];
  readonly initial: BattleStateV2;
  readonly inputs: readonly BattleInput[];
  readonly expectedReplay: ReplayV2;
};
