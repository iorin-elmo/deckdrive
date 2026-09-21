import { describe, expect, it } from 'vitest';

import { createInitialBattleState, validateAction } from '@deck-drive/game-engine';
import type { CardDefinition, MatchId, PlayerId } from '@deck-drive/game-engine';
import { chooseCpuAction, legalCpuActions } from './strategy.js';

const cpu = 'cpu' as PlayerId;
const player = 'player' as PlayerId;
const definitions: readonly CardDefinition[] = [
  { id: 'strike', cost: 1, effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }] },
];

function state() {
  return createInitialBattleState({
    matchId: 'cpu-match' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'seed',
    initialDrawCount: 1,
    turnDrawCount: 0,
    players: [
      { id: cpu, drawPile: [{ id: 'cpu-strike' as never, definitionId: 'strike' }] },
      { id: player, drawPile: [] },
    ],
  });
}

describe('CPU strategy', () => {
  it.each(['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const)(
    '%s chooses only legal engine actions',
    (difficulty) => {
      const battle = state();
      const action = chooseCpuAction(battle, cpu, definitions, difficulty);
      expect(validateAction(battle, action, definitions)).toEqual({ ok: true });
    },
  );

  it('plays an available card on EASY instead of always ending the turn', () => {
    expect(chooseCpuAction(state(), cpu, definitions, 'EASY')).toMatchObject({ type: 'PLAY_CARD' });
  });

  it('does not invent actions when the CPU is not active', () => {
    expect(legalCpuActions(state(), player, definitions)).toEqual([]);
  });
});
