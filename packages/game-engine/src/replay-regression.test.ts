import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  calculateDraftDefinitionRevision,
  recordReplayV2,
  verifyReplay,
  verifyReplayV2,
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
