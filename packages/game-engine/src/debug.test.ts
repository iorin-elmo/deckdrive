import { describe, expect, it } from 'vitest';
import {
  createInitialBattleState,
  type CardInstance,
  type MatchId,
  type PlayerId,
} from './index.js';
import { applyDebugBattleCommand, replayDebugBattle, type DebugBattleCommand } from './debug.js';

const alice = 'alice' as PlayerId;
const bob = 'bob' as PlayerId;
const card = (id: string) => ({ id, definitionId: 'test' }) as CardInstance;
function initial() {
  return createInitialBattleState({
    matchId: 'debug' as MatchId,
    engineVersion: '1',
    rulesVersion: '1',
    cardDataVersion: '1',
    seed: 'start',
    initialDrawCount: 0,
    turnDrawCount: 0,
    players: [
      { id: alice, drawPile: [card('a'), card('b')] },
      { id: bob, drawPile: [card('c')] },
    ],
  });
}

describe('isolated debug battle commands', () => {
  it('replays a forced draw, status, seed, turn and kill from recorded commands', () => {
    const commands: DebugBattleCommand[] = [
      { type: 'FORCE_DRAW', playerId: alice, cardInstanceId: 'b' },
      { type: 'APPLY_STATUS', playerId: bob, statusId: 'WEAK', stacks: 2 },
      { type: 'FORCE_RNG_SEED', seed: 'new-seed' },
      { type: 'SKIP_TURN' },
      { type: 'KILL_ENTITY', playerId: bob },
    ];
    const original = initial();
    const final = replayDebugBattle(original, commands);
    expect(final.players[0]?.hand.map((item) => item.id)).toEqual(['b']);
    expect(final.players[1]?.hp).toBe(0);
    expect(final.activePlayerId).toBe(bob);
    expect(original.players[0]?.hand).toEqual([]);
    expect(commands.reduce(applyDebugBattleCommand, original)).toEqual(final);
  });

  it('rejects an invalid draw without mutating the previous state', () => {
    const state = initial();
    const snapshot = structuredClone(state);
    expect(() =>
      applyDebugBattleCommand(state, {
        type: 'FORCE_DRAW',
        playerId: alice,
        cardInstanceId: 'missing',
      }),
    ).toThrow('DEBUG_CARD_NOT_IN_DRAW_PILE');
    expect(state).toEqual(snapshot);
  });
});
