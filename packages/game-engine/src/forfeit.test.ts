import { describe, expect, it } from 'vitest';
import {
  createInitialBattleState,
  recordReplay,
  verifyReplay,
  type MatchId,
  type PlayerId,
} from './index.js';

describe('server forfeit replay', () => {
  it('records a deterministic loss for a player outside their turn', () => {
    const first = 'first' as PlayerId;
    const second = 'second' as PlayerId;
    const initial = createInitialBattleState({
      matchId: 'ranked-forfeit' as MatchId,
      engineVersion: '1.1.0',
      rulesVersion: '1.1.0',
      cardDataVersion: '1.0.0',
      seed: 'ranked-forfeit-seed',
      initialDrawCount: 0,
      turnDrawCount: 0,
      players: [
        { id: first, drawPile: [] },
        { id: second, drawPile: [] },
      ],
    });
    const recorded = recordReplay(initial, [
      { type: 'FORFEIT', playerId: second, reason: 'DISCONNECT' },
    ]);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) throw new Error('Expected replay.');
    expect(recorded.replay.finalState.phase).toBe('MATCH_END');
    expect(recorded.replay.events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'PLAYER_FORFEITED', playerId: second, reason: 'DISCONNECT' }),
      expect.objectContaining({
        type: 'MATCH_FINISHED',
        result: { status: 'WIN', winnerId: first },
      }),
    ]);
    expect(verifyReplay(recorded.replay)).toEqual({ ok: true });
  });
});
