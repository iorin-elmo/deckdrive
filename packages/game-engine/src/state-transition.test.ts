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
    turnDrawCount: 1,
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
    for (const player of createState().players) {
      expect(player).toMatchObject({ hp: 30, maxHp: 30, energy: 3, maxEnergy: 3 });
    }
  });

  it('given an initial draw cadence, when a battle starts, then the first player draws that many cards', () => {
    const state = createInitialBattleState({
      matchId: 'draw-match' as MatchId,
      engineVersion: '1.0.0',
      rulesVersion: '1.0.0',
      cardDataVersion: '1.0.0',
      seed: 'seed',
      turnDrawCount: 2,
      players: [
        { id: playerOne, drawPile: [card('draw-1', 'strike'), card('draw-2', 'guard')] },
        { id: playerTwo, drawPile: [] },
      ],
    });

    expect(state.players[0]).toMatchObject({
      hand: [card('draw-1', 'strike'), card('draw-2', 'guard')],
      drawPile: [],
    });
    expect(state.events.map((event) => event.type)).toEqual(['CARD_DRAWN', 'CARD_DRAWN']);
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

  it('given a heal card, when it is played, then healing caps at max HP and omits no-op healing events', () => {
    const heal: CardDefinition = {
      id: 'heal',
      cost: 1,
      effects: [{ type: 'HEAL', amount: 6, target: 'SELF' }],
    };
    const original = createState();
    const state = {
      ...original,
      players: [
        { ...original.players[0]!, hp: 27, hand: [card('heal-1', heal.id)] },
        original.players[1]!,
      ],
    };
    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'heal-1' as CardInstanceId },
      [heal],
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.state.players[0]).toMatchObject({ hp: 30 });
    expect(result.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'HEALED', amount: 3 })]),
    );

    const maxHpResult = applyAction(
      { ...state, players: [{ ...state.players[0]!, hp: 30 }, state.players[1]!] },
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'heal-1' as CardInstanceId },
      [heal],
    );
    expect(maxHpResult).toMatchObject({ ok: true });
    if (!maxHpResult.ok) return;
    expect(maxHpResult.events.some((event) => event.type === 'HEALED')).toBe(false);
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

  it('given malformed or unsupported card effects, when they are validated, then they are rejected', () => {
    const state = createState();
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    const negativeHeal = {
      id: 'strike',
      cost: 1,
      effects: [{ type: 'HEAL' as const, amount: -1, target: 'SELF' as const }],
    };
    const custom = {
      id: 'strike',
      cost: 1,
      effects: [{ type: 'CUSTOM' as const, resolver: 'later', target: 'ENEMY' as const }],
    };

    expect(validateAction(state, action, [negativeHeal])).toMatchObject({
      ok: false,
      code: 'INVALID_CARD_DEFINITION',
    });
    expect(validateAction(state, action, [custom])).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_EFFECT',
    });
  });

  it('given lethal first effect, when a later enemy effect would resolve, then resolution stops safely', () => {
    const doubleStrike: CardDefinition = {
      id: 'strike',
      cost: 1,
      effects: [
        { type: 'DAMAGE', amount: 6, target: 'ENEMY' },
        { type: 'DAMAGE', amount: 1, target: 'ENEMY' },
      ],
    };
    const original = createState();
    const state = {
      ...original,
      players: [original.players[0]!, { ...original.players[1]!, hp: 6, block: 0 }],
    };
    const result = applyAction(
      state,
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'strike-1' as CardInstanceId },
      [doubleStrike],
    );

    expect(result).toMatchObject({ ok: true, state: { phase: 'MATCH_END' } });
    if (!result.ok) return;
    expect(result.events.filter((event) => event.type === 'DAMAGE_DEALT')).toHaveLength(1);
  });

  it('given a factory input without exactly two players, when it is created, then it rejects it', () => {
    expect(() =>
      createInitialBattleState({
        matchId: 'solo' as MatchId,
        engineVersion: '1.0.0',
        rulesVersion: '1.0.0',
        cardDataVersion: '1.0.0',
        seed: 'seed',
        turnDrawCount: 1,
        players: [{ id: playerOne, drawPile: [] }],
      }),
    ).toThrow('exactly two players');
  });

  it('given duplicate player IDs, when a battle is created, then it rejects the invalid battle', () => {
    expect(() =>
      createInitialBattleState({
        matchId: 'duplicate' as MatchId,
        engineVersion: '1.0.0',
        rulesVersion: '1.0.0',
        cardDataVersion: '1.0.0',
        seed: 'seed',
        turnDrawCount: 1,
        players: [
          { id: playerOne, drawPile: [] },
          { id: playerOne, drawPile: [] },
        ],
      }),
    ).toThrow('unique player IDs');
  });

  it('given duplicate card instance IDs, when a battle is created, then it rejects the invalid battle', () => {
    expect(() =>
      createInitialBattleState({
        matchId: 'duplicate-card' as MatchId,
        engineVersion: '1.0.0',
        rulesVersion: '1.0.0',
        cardDataVersion: '1.0.0',
        seed: 'seed',
        turnDrawCount: 1,
        players: [
          { id: playerOne, drawPile: [card('same', 'strike')] },
          { id: playerTwo, drawPile: [card('same', 'guard')] },
        ],
      }),
    ).toThrow('unique card instance IDs');
  });

  it('given a state restored after event 42, when an action emits events, then numbering continues at 43', () => {
    const state = {
      ...createState(),
      events: [{ type: 'TURN_STARTED' as const, sequence: 42, playerId: playerOne }],
    };
    const result = applyAction(state, { type: 'END_TURN', playerId: playerOne });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ type: 'TURN_ENDED', sequence: 43 });
  });

  it('given a stateful definition resolver, when a card is played, then the resolved definition is used once', () => {
    let calls = 0;
    const result = applyAction(
      createState(),
      { type: 'PLAY_CARD', playerId: playerOne, cardInstanceId: 'strike-1' as CardInstanceId },
      {
        resolve() {
          calls += 1;
          return calls === 1 ? strike : undefined;
        },
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(calls).toBe(1);
  });

  it('given malformed deserialized card data, when it is validated, then it returns an error instead of throwing', () => {
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    expect(() =>
      validateAction(createState(), action, [
        { id: 'strike', cost: 1, effects: null } as unknown as CardDefinition,
      ]),
    ).not.toThrow();
    expect(
      validateAction(createState(), action, [
        { id: 'strike', cost: 1, effects: null } as unknown as CardDefinition,
      ]),
    ).toMatchObject({ ok: false, code: 'INVALID_CARD_DEFINITION' });
  });

  it('given null entries in a deserialized definition source, when it is validated, then it does not throw', () => {
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    expect(() =>
      validateAction(createState(), action, [null] as unknown as CardDefinition[]),
    ).not.toThrow();
    expect(
      validateAction(createState(), action, [null] as unknown as CardDefinition[]),
    ).toMatchObject({
      ok: false,
      code: 'CARD_DEFINITION_NOT_FOUND',
    });
  });

  it('given a null effect in deserialized card data, when it is validated, then it returns an error', () => {
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    const definition = { id: 'strike', cost: 1, effects: [null] } as unknown as CardDefinition;

    expect(validateAction(createState(), action, [definition])).toMatchObject({
      ok: false,
      code: 'INVALID_CARD_DEFINITION',
    });
  });

  it('given a malformed resolver source, when a card is validated, then it returns a structured failure', () => {
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    for (const source of [null, { resolve: null }]) {
      expect(() =>
        validateAction(createState(), action, source as unknown as CardDefinition[]),
      ).not.toThrow();
      expect(
        validateAction(createState(), action, source as unknown as CardDefinition[]),
      ).toMatchObject({ ok: false, code: 'CARD_DEFINITION_NOT_FOUND' });
    }
  });

  it('given a resolver returning null, when a card is validated, then it returns a structured failure', () => {
    const action = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };
    const source = { resolve: () => null } as unknown as CardDefinition[];

    expect(() => validateAction(createState(), action, source)).not.toThrow();
    expect(validateAction(createState(), action, source)).toMatchObject({
      ok: false,
      code: 'CARD_DEFINITION_NOT_FOUND',
    });
  });

  it('given an unknown action type or mismatched resolved definition, when it is validated, then it is rejected', () => {
    const unknownAction = {
      type: 'UNKNOWN',
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    } as unknown as Parameters<typeof validateAction>[1];
    const validAction = {
      type: 'PLAY_CARD' as const,
      playerId: playerOne,
      cardInstanceId: 'strike-1' as CardInstanceId,
    };

    expect(validateAction(createState(), unknownAction, [strike])).toMatchObject({
      ok: false,
      code: 'UNKNOWN_ACTION_TYPE',
    });
    expect(
      validateAction(createState(), validAction, {
        resolve: () => ({ ...strike, id: 'other-card' }),
      }),
    ).toMatchObject({ ok: false, code: 'CARD_DEFINITION_NOT_FOUND' });
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
