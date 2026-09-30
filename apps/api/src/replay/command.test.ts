import { describe, expect, it } from 'vitest';

import { parseReplayMatchId } from './command.js';

describe('replay CLI arguments', () => {
  it('accepts an explicit match ID', () => {
    expect(parseReplayMatchId(['--match', 'match-123'])).toBe('match-123');
  });

  it('rejects missing or ambiguous match IDs', () => {
    expect(() => parseReplayMatchId([])).toThrow('Usage: pnpm replay --match <matchId>');
    expect(() => parseReplayMatchId(['--match'])).toThrow('Usage: pnpm replay --match <matchId>');
    expect(() => parseReplayMatchId(['match-123'])).toThrow('Usage: pnpm replay --match <matchId>');
  });
});
