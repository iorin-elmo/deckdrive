import { describe, expect, it } from 'vitest';

import { applyAction, createInitialBattleState, validateAction } from './index.js';
import type {
  BattleState,
  CardDefinition,
  CardInstance,
  CardInstanceId,
  MatchId,
  PlayerId,
} from './index.js';

const playerOne = 'player-1' as PlayerId;
const playerTwo = 'player-2' as PlayerId;
const strike: CardDefinition = {
  id: 'strike',
  cost: 1,
  effects: [{ type: 'DAMAGE', amount: 6, target: 'ENEMY' }],
};
const insight: CardDefinition = {
  id: 'insight',
  cost: 1,
  effects: [{ type: 'DRAW', amount: 2, target: 'SELF' }],
};
const guard: CardDefinition = {
  id: 'guard',
  cost: 1,
  effects: [{ type: 'GAIN_BLOCK', amount: 5, target: 'SELF' }],
};

function card(id: string, definitionId: string): CardInstance {
  return { id: id as CardInstanceId, definitionId };
}

function createState(): BattleState {
  const initial = createInitialBattleState({
    matchId: 'match-1' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'seed-1',
    players: [
      { id: playerOne, drawPile: [] },
      { id: playerTwo, drawPile: [] },
    ],
  });
  return {
    ...initial,
    players: [
      { ...initial.players[0]!, hand: [card('strike-1', strike.id)] },
      { ...initial.players[1]!, block: 2 },
    ],
  };
}

describe('state transitions', () => {
  it('given the initial state, when it is created, then each player starts at HP 30 and energy 3', () => {
    expect(createState().players[0]).toMatchObject({ hp: 30, maxHp: 30, energy: 3, maxEnergy: 3 });
  });

  it('given an attack and block, when a card is played, then block absorbs damage before HP', () => {
    const state = createState();
    const snapshot = structuredClone(state);
    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'strike-1' as CardInstanceId },
      [strike],
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.state.players[0]).toMatchObject({
      energy: 2,
      hand: [],
      discard: [card('strike-1', 'strike')],
    });
    expect(result.state.players[1]).toMatchObject({ hp: 26, block: 0 });
    expect(result.events.map((event) => event.type)).toEqual([
      'CARD_PLAYED',
      'EFFECT_STARTED',
      'DAMAGE_DEALT',
      'BLOCK_REDUCED',
      'ENTITY_DAMAGED',
      'CARD_DISCARDED',
    ]);
    expect(result.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(state).toEqual(snapshot);
  });

  it('given a draw card, when it is played, then cards move from draw pile into hand', () => {
    const original = createState();
    const state = {
      ...original,
      players: [
        {
          ...original.players[0]!,
          hand: [card('insight-1', insight.id)],
          drawPile: [card('draw-1', 'strike'), card('draw-2', 'guard')],
        },
        original.players[1]!,
      ],
    };
    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'insight-1' as CardInstanceId },
      [insight],
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.state.players[0]).toMatchObject({
      hand: [card('draw-1', 'strike'), card('draw-2', 'guard')],
      drawPile: [],
      discard: [card('insight-1', 'insight')],
    });
    expect(result.events.map((event) => event.type)).toEqual([
      'CARD_PLAYED',
      'EFFECT_STARTED',
      'CARD_DRAWN',
      'CARD_DRAWN',
      'CARD_DISCARDED',
    ]);
  });

  it('given a block card, when it is played, then it grants block and spends energy', () => {
    const original = createState();
    const state = {
      ...original,
      players: [
        { ...original.players[0]!, hand: [card('guard-1', guard.id)] },
        original.players[1]!,
      ],
    };

    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'guard-1' as CardInstanceId },
      [guard],
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.state.players[0]).toMatchObject({ energy: 2, block: 5 });
    expect(result.events.map((event) => event.type)).toEqual([
      'CARD_PLAYED',
      'EFFECT_STARTED',
      'BLOCK_GAINED',
      'CARD_DISCARDED',
    ]);
  });

  it('given lethal damage, when the card resolves, then the match finishes after the card is discarded', () => {
    const original = createState();
    const state = {
      ...original,
      players: [original.players[0]!, { ...original.players[1]!, hp: 6, block: 0 }],
    };
    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'strike-1' as CardInstanceId },
      [strike],
    );

    expect(result).toMatchObject({ ok: true, state: { phase: 'MATCH_END' } });
    if (!result.ok) return;
    expect(result.events.map((event) => event.type)).toEqual([
      'CARD_PLAYED',
      'EFFECT_STARTED',
      'DAMAGE_DEALT',
      'ENTITY_DAMAGED',
      'CARD_DISCARDED',
      'MATCH_FINISHED',
    ]);
    expect(result.events.at(-1)).toMatchObject({
      type: 'MATCH_FINISHED',
      result: { status: 'WIN', winnerId: playerOne },
    });
  });

  it('given too little energy, when a card is validated, then it is rejected without mutation', () => {
    const original = createState();
    const state = {
      ...original,
      players: [{ ...original.players[0]!, energy: 0 }, original.players[1]!],
    };
    const snapshot = structuredClone(state);
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };

    expect(validateAction(state, action, [strike])).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_ENERGY',
    });
    expect(applyAction(state, action, [strike])).toMatchObject({
      ok: false,
      error: { code: 'INSUFFICIENT_ENERGY' },
    });
    expect(state).toEqual(snapshot);
  });

  it('given an end turn, when it resolves, then the next player draws and starts their turn', () => {
    const original = createState();
    const state = {
      ...original,
      players: [
        original.players[0]!,
        { ...original.players[1]!, drawPile: [card('draw-1', 'strike')] },
      ],
    };
    const result = applyAction(state, { type: 'END_TURN', playerId: playerOne });

    expect(result).toMatchObject({
      ok: true,
      state: { activePlayerId: playerTwo, phase: 'PLAYER_TURN' },
    });
    if (!result.ok) return;
    expect(result.state.players[1]).toMatchObject({
      hand: [card('draw-1', 'strike')],
      drawPile: [],
    });
    expect(result.events.map((event) => event.type)).toEqual([
      'TURN_ENDED',
      'CARD_DRAWN',
      'TURN_STARTED',
    ]);
  });
});
