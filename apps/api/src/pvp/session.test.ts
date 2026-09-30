import { describe, expect, it, vi } from 'vitest';
import { createInitialBattleState } from '@deck-drive/game-engine';
import type { BattleState, MatchId, PlayerId } from '@deck-drive/game-engine';

import { MatchSession } from './session.js';

function state(): BattleState {
  return createInitialBattleState({
    matchId: 'match-1' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'secret-seed',
    initialDrawCount: 0,
    turnDrawCount: 0,
    players: [
      { id: 'player-1' as PlayerId, drawPile: [] },
      { id: 'player-2' as PlayerId, drawPile: [] },
    ],
  });
}

describe('MatchSession', () => {
  it('serializes concurrent actions and makes retries idempotent', async () => {
    const sent1: unknown[] = [];
    const sent2: unknown[] = [];
    const session = new MatchSession({ state: state(), now: () => 1_000 });
    session.connect({ playerId: 'player-1' as PlayerId, send: (message) => sent1.push(message) });
    session.connect({ playerId: 'player-2' as PlayerId, send: (message) => sent2.push(message) });

    const first = session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'a',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
    const stale = session.receive('player-2' as PlayerId, {
      type: 'ACTION',
      requestId: 'b',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-2' },
    });
    const [accepted, rejected] = await Promise.all([first, stale]);
    expect(accepted.some((message) => message.type === 'STATE')).toBe(true);
    expect(rejected[0]).toMatchObject({ type: 'ERROR', code: 'STALE_ACTION', expectedSequence: 1 });
    expect(session.currentState.activePlayerId).toBe('player-2');
    expect(
      await session.receive('player-1' as PlayerId, {
        type: 'ACTION',
        requestId: 'a',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      }),
    ).toEqual(accepted);
    expect(sent1.length).toBeGreaterThan(0);
    expect(sent2.length).toBeGreaterThan(0);
  });

  it('returns a state plus missing events on resync and auto-ends timed out turns', async () => {
    let now = 0;
    const session = new MatchSession({ state: state(), now: () => now, turnTimeoutMs: 60_000 });
    session.connect({ playerId: 'player-1' as PlayerId, send: vi.fn() });
    session.connect({ playerId: 'player-2' as PlayerId, send: vi.fn() });
    now = 60_000;
    session.tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(session.actionSequence).toBe(1);
    const resync = await session.receive('player-2' as PlayerId, {
      type: 'RESYNC',
      afterEventSequence: 0,
    });
    expect(resync[0]).toMatchObject({ type: 'STATE', snapshotActionIndex: 1 });
  });

  it('does not advance memory when the persistence callback fails', async () => {
    const session = new MatchSession({
      state: state(),
      onAction: () => {
        throw new Error('database unavailable');
      },
    });
    const result = await session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'persist-failure',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
    expect(result[0]).toMatchObject({ type: 'ERROR', code: 'MATCH_UNAVAILABLE' });
    expect(session.actionSequence).toBe(0);
    expect(session.currentState.activePlayerId).toBe('player-1');
  });
});
