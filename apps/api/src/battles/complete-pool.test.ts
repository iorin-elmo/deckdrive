import { describe, expect, it } from 'vitest';
import { allCardDefinitions as catalog } from '@deck-drive/card-definitions';
import {
  applyBattleInputV2,
  calculateDraftDefinitionRevision,
  calculateResultV2,
  createInitialBattleStateV2,
  legalActionsV2,
  projectBattleStateV2,
  recordReplayV2,
  verifyReplayV2,
  type CardDefinitionV2,
  type BattleStateV2,
  type CardInstanceId,
  type CardInstanceV2,
  type GameActionV2,
  type MatchId,
  type PlayerId,
} from '@deck-drive/game-engine';
const allCardDefinitions = catalog as unknown as readonly CardDefinitionV2[];
const p1 = 'p1' as PlayerId,
  p2 = 'p2' as PlayerId;
const card = (definitionId: string, index: number): CardInstanceV2 => ({
  id: `card:${index}` as CardInstanceId,
  definitionId,
  definitionVersion: '1.0.0',
  visibility: 'ownerOnly',
  costModifier: 0,
});
function battle(ids: string[]): BattleStateV2 {
  const initial = createInitialBattleStateV2({
    matchId: 'complete-pool' as MatchId,
    engineVersion: '3.0.0',
    rulesVersion: '3.0.0',
    cardDataVersion: '1.0.0',
    seed: 'complete-pool',
    initialDrawCount: ids.length,
    turnDrawCount: 1,
    players: [
      { id: p1, drawPile: ids.map(card) },
      { id: p2, drawPile: [] },
    ],
  });
  return { ...initial, players: initial.players.map((player) => ({ ...player, energy: 100 })) };
}
function apply(state: BattleStateV2, action: GameActionV2): BattleStateV2 {
  const result = applyBattleInputV2(
    state,
    { kind: 'CLIENT_ACTION', inputSequence: state.lastInputSequence + 1, payload: action },
    allCardDefinitions,
  );
  expect(result.ok, result.ok ? '' : result.error.code).toBe(true);
  if (!result.ok) throw Error(result.error.code);
  return result.state;
}
function play(state: BattleStateV2, id: string): BattleStateV2 {
  const action = legalActionsV2(state, allCardDefinitions, p1).find(
    (action) =>
      action.type === 'PLAY_CARD' &&
      state.players[0]!.hand.find((card) => card.id === action.cardInstanceId)?.definitionId === id,
  );
  expect(action, `No legal action for ${id}`).toBeDefined();
  return apply(state, action!);
}
describe('complete card pool battles', () => {
  it.each(
    allCardDefinitions
      .filter((definition) => definition.effects.some((effect) => effect.type === 'POOL_CARD'))
      .map((definition) => [definition.id]),
  )('executes %s with valid owned targets', (id) => {
    const support = [
      'neutral_003',
      'alchemist_001',
      'alchemist_002',
      'alchemist_003',
      'alchemist_004',
      'mage_011',
      'hunter_003',
      'hunter_009',
      'hunter_010',
    ].filter((support) => support !== id);
    let state = battle([id, ...support]);
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index
          ? player
          : {
              ...player,
              hp: id === 'neutral_009' ? 8 : 20,
              drawPile: [card('neutral_001', 100), card('sword_002', 101), card('hunter_005', 102)],
              discard: [card('neutral_002', 103)],
              pool: {
                values: { swordsThisTurn: 1 },
                arrowQueue:
                  id === 'hunter_008'
                    ? [player.hand.find((card) => card.definitionId === 'hunter_003')!.id]
                    : [],
                modifiers: {},
              },
            },
      ),
    };
    const definition = allCardDefinitions.find((definition) => definition.id === id)!;
    if (definition.keywords?.includes('arrow')) {
      const bow = state.players[0]!.hand.find((card) => card.definitionId === 'hunter_009')!;
      state = apply(state, {
        type: 'PLAY_CARD',
        playerId: p1,
        cardInstanceId: bow.id,
        choices: [{ kind: 'CARD_INSTANCES', cardInstanceIds: ['card:0' as CardInstanceId] }],
      });
      state = play(state, 'hunter_010');
      expect(state.events).toContainEqual(
        expect.objectContaining({ type: 'ARROW_FIRED', definitionId: id }),
      );
    } else state = play(state, id);
    expect(state.players[0]!.hand.some((card) => card.id === 'card:0')).toBe(false);
    expect([...state.players[0]!.discard, ...state.players[0]!.exhaust]).toContainEqual(
      expect.objectContaining({ id: 'card:0' }),
    );
    const ids = state.players.flatMap((player) =>
      [...player.hand, ...player.drawPile, ...player.discard, ...player.exhaust].map(
        (card) => card.id,
      ),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('completes the Sage Stone route and rejects skipping its stages', () => {
    let state = battle([
      'alchemist_001',
      'alchemist_002',
      'alchemist_004',
      'alchemist_015',
      'alchemist_016',
      'alchemist_017',
    ]);
    expect(
      legalActionsV2(state, allCardDefinitions, p1).some(
        (action) => action.type === 'PLAY_CARD' && action.cardInstanceId === 'card:5',
      ),
    ).toBe(false);
    state = play(state, 'alchemist_015');
    expect(state.players[0]!.alchemyStage).toBe(1);
    state = play(state, 'alchemist_016');
    expect(state.players[0]!.alchemyStage).toBe(3);
    state = play(state, 'alchemist_017');
    expect(calculateResultV2(state)).toMatchObject({
      status: 'WIN',
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'ALCHEMY_SAGE_STONE',
    });
  });
  it('reveals catalyst material before selection and grants core energy once per turn', () => {
    let state = battle(['alchemist_010', 'alchemist_012', 'alchemist_008', 'alchemist_001']);
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index ? player : { ...player, drawPile: [card('alchemist_003', 100)] },
      ),
    };
    state = play(state, 'alchemist_010');
    state = play(state, 'alchemist_012');
    state = play(state, 'alchemist_008');
    expect(state.pendingCardChoice).toMatchObject({ choiceKind: 'CARDS', minSelections: 2 });
    const deadline = applyBattleInputV2(
      state,
      {
        kind: 'SERVER_COMMAND',
        inputSequence: state.lastInputSequence + 1,
        payload: {
          type: 'CARD_CHOICE_DEADLINE_ISSUED',
          playerId: p1,
          choiceRequestId: state.pendingCardChoice!.choiceRequestId,
          issuedAt: 0,
          deadlineAt: 60000,
          timeoutAuthorization: 'test',
        },
      },
      allCardDefinitions,
      () => true,
    );
    expect(deadline.ok).toBe(true);
    if (!deadline.ok) throw Error('deadline');
    state = deadline.state;
    const energy = state.players[0]!.energy;
    state = apply(state, legalActionsV2(state, allCardDefinitions, p1)[0]!);
    expect(state.players[0]!.energy).toBe(energy + 1);
    expect(state.players[0]!.hand.some((card) => card.definitionId === 'alchemist_005')).toBe(true);
    expect(state.events.find((event) => event.type === 'DECK_CARD_REVEALED')).toMatchObject({
      visibility: 'allPlayers',
      definitionId: 'alchemist_003',
    });
  });
  it('ticks poison through block and reduces the stack after each turn', () => {
    let state = battle(['hunter_009', 'hunter_003', 'hunter_010']);
    state = apply(state, {
      type: 'PLAY_CARD',
      playerId: p1,
      cardInstanceId: 'card:0' as CardInstanceId,
      choices: [{ kind: 'CARD_INSTANCES', cardInstanceIds: ['card:1' as CardInstanceId] }],
    });
    state = play(state, 'hunter_010');
    state = {
      ...state,
      players: state.players.map((player, index) => (index ? { ...player, block: 99 } : player)),
    };
    state = apply(state, { type: 'END_TURN', playerId: p1 });
    expect(state.players[1]!.hp).toBe(24);
    expect(state.players[1]!.block).toBe(99);
    expect(state.players[1]!.pool?.values.poison).toBe(1);
  });
  it('keeps magic charge until a damage hit and applies it once', () => {
    let state = battle(['mage_003', 'mage_012', 'mage_001', 'mage_001']);
    state = play(state, 'mage_003');
    state = play(state, 'mage_012');
    state = play(state, 'mage_001');
    expect(state.players[1]!.hp).toBe(23);
    state = play(state, 'mage_001');
    expect(state.players[1]!.hp).toBe(18);
  });
  it.each([
    ['sword_001', 24],
    ['sword_002', 27],
    ['sword_004', 22],
    ['sword_009', 22],
    ['sword_010', 16],
    ['sword_012', 20],
    ['mage_001', 25],
    ['mage_002', 27],
    ['mage_007', 24],
    ['trickster_003', 27],
    ['trickster_009', 24],
  ] as const)('%s applies its damage', (id, hp) => {
    expect(play(battle([id]), id).players[1]!.hp).toBe(hp);
  });
  it('carries next-sword boost to exactly the next sword', () => {
    let state = battle(['sword_005', 'sword_004', 'sword_002']);
    state = play(state, 'sword_005');
    state = play(state, 'sword_004');
    expect(state.players[1]!.hp).toBe(19);
    state = play(state, 'sword_002');
    expect(state.players[1]!.hp).toBe(13);
  });
  it('prevents all hits of the first enemy attack', () => {
    let state = battle(['guardian_011']);
    state = play(state, 'guardian_011');
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index
          ? { ...player, hand: [card('sword_004', 100)], energy: 100 }
          : { ...player, block: 0 },
      ),
    };
    state = apply(state, { type: 'END_TURN', playerId: p1 });
    state = apply(state, {
      type: 'PLAY_CARD',
      playerId: p2,
      cardInstanceId: 'card:100' as CardInstanceId,
    });
    expect(state.players[0]!.hp).toBe(30);
  });
  it('loads arrows privately, fires them in order, and applies poison', () => {
    let state = battle(['hunter_009', 'hunter_003', 'hunter_005', 'hunter_010']);
    const load = {
      type: 'PLAY_CARD',
      playerId: p1,
      cardInstanceId: 'card:0' as CardInstanceId,
      choices: [
        { kind: 'CARD_INSTANCES', cardInstanceIds: ['card:1', 'card:2'] as CardInstanceId[] },
      ],
    } as const;
    state = apply(state, load);
    const opponent = projectBattleStateV2(state, p2) as {
      players: { pool: { arrowCount: number; arrowQueue?: unknown } }[];
    };
    expect(opponent.players[0]!.pool).toHaveProperty('arrowCount', 2);
    expect(opponent.players[0]!.pool).not.toHaveProperty('arrowQueue');
    state = play(state, 'hunter_010');
    expect(state.players[1]!.hp).toBe(20);
    expect(state.players[1]!.pool?.values.poison).toBe(2);
    expect(state.players[0]!.pool?.arrowQueue).toEqual([]);
    expect(state.players[0]!.block).toBe(7);
  });
  it('resolves Grand Wish through the production action path', () => {
    let state = battle(['mage_017', 'mage_015']);
    state = play(state, 'mage_017');
    state = play(state, 'mage_015');
    expect(calculateResultV2(state)).toEqual({
      status: 'WIN',
      winnerId: p1,
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'MAGE_GRAND_WISH',
    });
  });
  it('permits surrender while a card choice is pending', () => {
    let state = battle(['trickster_010', 'neutral_001']);
    state = play(state, 'trickster_010');
    expect(state.pendingCardChoice).toBeDefined();
    state = apply(state, { type: 'FORFEIT', playerId: p2 });
    expect(calculateResultV2(state)).toEqual({ status: 'WIN', winnerId: p1, reason: 'FORFEIT' });
  });
  it('replays new card effects with pinned definitions', () => {
    const setup = battle(['sword_005', 'sword_004']);
    const initial = {
      ...setup,
      players: setup.players.map((player) => ({ ...player, energy: 3 })),
    };
    const inputs = [
      {
        kind: 'CLIENT_ACTION' as const,
        inputSequence: 1,
        payload: {
          type: 'PLAY_CARD' as const,
          playerId: p1,
          cardInstanceId: 'card:0' as CardInstanceId,
        },
      },
      {
        kind: 'CLIENT_ACTION' as const,
        inputSequence: 2,
        payload: {
          type: 'PLAY_CARD' as const,
          playerId: p1,
          cardInstanceId: 'card:1' as CardInstanceId,
        },
      },
    ];
    const replay = recordReplayV2(initial, inputs, allCardDefinitions, {
      battleProtocolVersion: 2,
      draftDefinitionRevision: calculateDraftDefinitionRevision(allCardDefinitions),
    });
    expect(replay.ok, JSON.stringify(replay)).toBe(true);
    if (replay.ok)
      expect(
        verifyReplayV2(
          replay.replay,
          () => allCardDefinitions,
          () => false,
        ),
      ).toMatchObject({ ok: true });
  });
});
