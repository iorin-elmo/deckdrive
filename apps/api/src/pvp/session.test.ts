import { describe, expect, it, vi } from 'vitest';
import { createInitialBattleState } from '@deck-drive/game-engine';
import type { BattleState, CardInstanceId, MatchId, PlayerId } from '@deck-drive/game-engine';

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

  it('rejects reuse of a request ID with different action input', async () => {
    const session = new MatchSession({ state: state() });
    await session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'same-request',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
    await expect(
      session.receive('player-1' as PlayerId, {
        type: 'ACTION',
        requestId: 'same-request',
        sequence: 1,
        action: { type: 'END_TURN', playerId: 'player-2' },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'ERROR',
        code: 'REQUEST_CONFLICT',
        requestId: 'same-request',
      }),
    ]);
    expect(session.actionSequence).toBe(1);
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

  it('shares an in-flight retry and does not cache failed persistence', async () => {
    let release!: () => void;
    let attempts = 0;
    const session = new MatchSession({
      state: state(),
      onAction: async () => {
        attempts += 1;
        if (attempts === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (attempts === 1) throw new Error('database unavailable');
      },
    });
    const first = session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'retryable',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
    const duplicate = session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'retryable',
      sequence: 0,
      action: { type: 'END_TURN', playerId: 'player-1' },
    });
    expect(first).toBe(duplicate);
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    await expect(first).resolves.toMatchObject([{ type: 'ERROR', code: 'MATCH_UNAVAILABLE' }]);
    await expect(
      session.receive('player-1' as PlayerId, {
        type: 'ACTION',
        requestId: 'retryable',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      }),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'STATE' })]));
    expect(attempts).toBe(2);
  });

  it('keeps a play-card turn deadline and ignores a stale socket disconnect', async () => {
    let now = 0;
    const battleState = createInitialBattleState({
      ...state(),
      initialDrawCount: 1,
      players: [
        {
          id: 'player-1' as PlayerId,
          drawPile: [{ id: 'card-1' as CardInstanceId, definitionId: 'strike' }],
        },
        { id: 'player-2' as PlayerId, drawPile: [] },
      ],
    });
    const session = new MatchSession({
      state: battleState,
      definitions: [
        { id: 'strike', cost: 1, effects: [{ type: 'DAMAGE', amount: 1, target: 'ENEMY' }] },
      ],
      now: () => now,
    });
    const oldMessages: unknown[] = [];
    const newMessages: unknown[] = [];
    const oldClient = {
      playerId: 'player-1' as PlayerId,
      send: (message: unknown) => oldMessages.push(message),
    };
    const newClient = {
      playerId: 'player-1' as PlayerId,
      send: (message: unknown) => newMessages.push(message),
    };
    session.connect(oldClient);
    session.connect(newClient);
    session.connect({ playerId: 'player-2' as PlayerId, send: vi.fn() });
    session.disconnect(oldClient);
    await session.receive('player-1' as PlayerId, {
      type: 'ACTION',
      requestId: 'play-card',
      sequence: 0,
      action: {
        type: 'PLAY_CARD',
        playerId: 'player-1',
        cardInstanceId: 'card-1',
        targetId: 'player-2',
      },
    });
    now = 60_000;
    session.tick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(session.actionSequence).toBe(2);
    expect(newMessages.some((message) => (message as { type?: string }).type === 'STATE')).toBe(
      true,
    );
    expect(oldMessages.length).toBeGreaterThan(0);
  });
});
