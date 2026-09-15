import { describe, expect, it } from 'vitest';

import { verifyReplay } from './index.js';
import type { Replay } from './index.js';
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
});
