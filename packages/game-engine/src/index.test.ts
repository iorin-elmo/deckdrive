import { describe, expect, it } from 'vitest';

import { applyAction, validateAction } from './index.js';
import type { BattleState, CardInstanceId, MatchId, PlayerId } from './index.js';

const playerOne = 'player-1' as PlayerId;
const playerTwo = 'player-2' as PlayerId;

function createState(): BattleState {
  return {
    matchId: 'match-1' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'seed-1',
    turn: 1,
    activePlayerId: playerOne,
    phase: 'PLAYER_TURN',
    turnDrawCount: 1,
    players: [
      {
        id: playerOne,
        hp: 20,
        maxHp: 20,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        drawPile: [],
        hand: [],
        discard: [],
        statuses: [],
      },
      {
        id: playerTwo,
        hp: 20,
        maxHp: 20,
        energy: 3,
        maxEnergy: 3,
        block: 0,
        drawPile: [],
        hand: [],
        discard: [],
        statuses: [],
      },
    ],
    stack: [],
    events: [],
  };
}

describe('game-engine public contracts', () => {
  it('rejects an inactive player action without changing state', () => {
    const state = createState();
    const snapshot = structuredClone(state);

    const result = applyAction(state, { type: 'END_TURN', playerId: playerTwo });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'NOT_ACTIVE_PLAYER' },
      events: [],
    });
    expect(result.state).toBe(state);
    expect(state).toEqual(snapshot);
  });

  it('rejects a play action for a card that is not in the player hand', () => {
    const state = createState();
    const cardInstanceId = 'card-instance-1' as CardInstanceId;

    const validation = validateAction(state, {
      type: 'PLAY_CARD',
      playerId: playerOne,
      cardInstanceId,
    });

    expect(validation).toMatchObject({ ok: false, code: 'CARD_NOT_IN_HAND' });
  });
});
