import { describe, expect, it } from 'vitest';

import {
  applyBattleInputV2,
  applyPercentageFloor,
  calculateDraftDefinitionRevision,
  calculateReplayV2Checksum,
  calculateResultV2,
  createInitialBattleStateV2,
  projectBattleStateV2,
  recordReplayV2,
  verifyReplayV2,
} from './index.js';
import type {
  BattleInput,
  BattleStateV2,
  CardDefinitionV2,
  CardInstanceId,
  CardInstanceV2,
  MatchId,
  PlayCardActionV2,
  PlayerId,
  ReplayV2,
} from './index.js';
import { sha256Hex } from './sha256.js';

const playerOne = 'player-1' as PlayerId;
const playerTwo = 'player-2' as PlayerId;

const definitions: readonly CardDefinitionV2[] = [
  definition(
    'mage_017',
    3,
    [
      {
        type: 'START_CHANT',
        countdown: 100,
        damageDelay: 5,
        completionEffects: [{ type: 'SPECIAL_VICTORY', specialVictoryId: 'MAGE_GRAND_WISH' }],
      },
    ],
    ['magic', 'wish'],
  ),
  definition('mage_018', 1, [{ type: 'EXHAUST_GRIMOIRE_ADVANCE_WISH', amount: 10 }]),
  definition('mage_019', 1, [{ type: 'SEAL_GRIMOIRE' }], ['grimoire']),
  definition('mage_015', 3, [{ type: 'RESOLVE_ALL_CHANTS', blockPerChant: 3 }]),
  definition(
    'alchemist_001',
    0,
    [{ type: 'DAMAGE', amount: 2, target: 'ENEMY' }],
    ['material', 'reagent:red'],
  ),
  definition(
    'alchemist_002',
    0,
    [{ type: 'GAIN_BLOCK', amount: 3, target: 'SELF' }],
    ['material', 'reagent:blue'],
  ),
  definition(
    'alchemist_003',
    1,
    [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    ['material', 'catalyst'],
  ),
  definition(
    'alchemist_004',
    1,
    [{ type: 'HEAL', amount: 2, target: 'SELF' }],
    ['material', 'reagent:white'],
  ),
  definition('alchemist_005', 1, [{ type: 'DAMAGE', amount: 7, target: 'ENEMY' }]),
  definition('alchemist_006', 1, [{ type: 'GAIN_BLOCK', amount: 8, target: 'SELF' }]),
  definition('alchemist_008', 0, [{ type: 'SYNTHESIZE', mode: 'NORMAL' }]),
  definition('alchemist_015', 2, [{ type: 'SYNTHESIZE', mode: 'SAGE_RECIPE' }]),
  definition('alchemist_016', 2, [{ type: 'SET_ALCHEMY_STAGE', requiredStage: 1, stage: 3 }]),
  definition('alchemist_017', 3, [
    {
      type: 'SPECIAL_VICTORY',
      specialVictoryId: 'ALCHEMY_SAGE_STONE',
      requiredAlchemyStage: 3,
    },
  ]),
  definition('alchemist_007', 1, [{ type: 'TRANSFORM_HAND_CARD' }]),
  definition('alchemist_011', 2, [{ type: 'SYNTHESIZE', mode: 'COMPLETE_REACTION' }]),
  definition(
    'alchemist_014',
    1,
    [{ type: 'DRAW', amount: 1, target: 'SELF' }],
    ['material', 'solvent'],
  ),
  definition('alchemist_013', 3, [{ type: 'SYNTHESIZE', mode: 'ALL_MATERIALS' }]),
  definition('test_search', 1, [
    { type: 'REQUEST_CARD_CHOICE', from: 'DRAW_PILE', maximumCost: 1 },
  ]),
  definition('test_draw', 0, [{ type: 'DRAW', amount: 2, target: 'SELF' }]),
  definition('test_energy', 0, [{ type: 'GAIN_ENERGY', amount: 2, target: 'SELF' }]),
  definition('test_attack', 0, [{ type: 'DAMAGE', amount: 1, target: 'ENEMY' }]),
  definition('test_lethal', 0, [{ type: 'DAMAGE', amount: 30, target: 'ENEMY' }]),
];

describe('battle protocol 2 special victory routes', () => {
  it('keeps chants outside card zones and resolves the Mage special victory', () => {
    let state = battle([
      card('wish', 'mage_017'),
      card('book', 'mage_019'),
      card('burn', 'mage_018'),
      card('stop', 'mage_015'),
    ]);
    state = withEnergy(state, playerOne, 10);

    state = apply(state, client(1, play('wish')));
    expect(state.chantQueue).toMatchObject([
      { chantEntryId: 'chant:1', sourceDefinitionId: 'mage_017', remaining: 100 },
    ]);
    expect(allZoneIds(state, playerOne)).not.toContain('chant:1');

    state = apply(
      state,
      client(2, {
        ...play('burn'),
        choices: [
          { kind: 'CARD_INSTANCES', cardInstanceIds: ['book' as CardInstanceId] },
          { kind: 'CHANT_ENTRY', chantEntryId: 'chant:1' },
        ],
      }),
    );
    expect(state.chantQueue[0]).toMatchObject({ remaining: 90 });
    expect(state.players[0]!.exhaust.map((entry) => entry.id)).toContain('book');

    state = apply(state, client(3, play('stop')));
    expect(calculateResultV2(state)).toEqual({
      status: 'WIN',
      winnerId: playerOne,
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'MAGE_GRAND_WISH',
    });
    expect(state.phase).toBe('MATCH_END');
    expect(state.chantQueue).toEqual([]);
    expect(state.events.filter((event) => event.type === 'MATCH_FINISHED')).toHaveLength(1);
  });

  it('delays only the damaged owner chants and advances them before that owner draws', () => {
    let state = withEnergy(
      battle([card('wish', 'mage_017')], [card('attack', 'test_attack')]),
      playerOne,
      10,
    );
    state = apply(state, client(1, play('wish')));
    state = apply(state, client(2, { type: 'END_TURN', playerId: playerOne }));
    state = apply(
      state,
      client(3, {
        type: 'PLAY_CARD',
        playerId: playerTwo,
        cardInstanceId: 'attack' as CardInstanceId,
      }),
    );
    expect(state.chantQueue[0]).toMatchObject({ remaining: 105 });
    state = apply(state, client(4, { type: 'END_TURN', playerId: playerTwo }));
    expect(state.chantQueue[0]).toMatchObject({ remaining: 104 });
    const turnStart = state.events.findIndex(
      (event) => event.type === 'TURN_STARTED' && event.playerId === playerOne,
    );
    const chantAdvance = state.events.findIndex(
      (event, index) => index > turnStart && event.type === 'CHANT_ADVANCED',
    );
    expect(chantAdvance).toBeGreaterThan(turnStart);
  });

  it('completes the staged Alchemist route and records deterministic synthesis progress', () => {
    let state = battle([
      card('red', 'alchemist_001'),
      card('blue', 'alchemist_002'),
      card('white', 'alchemist_004'),
      card('recipe', 'alchemist_015'),
      card('first', 'alchemist_016'),
      card('complete', 'alchemist_017'),
    ]);
    state = withEnergy(state, playerOne, 10);
    state = apply(
      state,
      client(1, {
        ...play('recipe'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['red', 'blue', 'white'] as CardInstanceId[],
          },
        ],
      }),
    );
    expect(state.players[0]).toMatchObject({ synthesisCount: 1, alchemyStage: 1 });
    expect(state.players[0]!.exhaust).toHaveLength(3);

    state = apply(state, client(2, play('first')));
    expect(state.players[0]!.alchemyStage).toBe(3);
    state = apply(state, client(3, play('complete')));
    expect(calculateResultV2(state)).toEqual({
      status: 'WIN',
      winnerId: playerOne,
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'ALCHEMY_SAGE_STONE',
    });
    expect(state.events.filter((event) => event.type === 'SYNTHESIS_RESOLVED')).toEqual([
      expect.objectContaining({ beforeCount: 0, afterCount: 1, result: 'SUCCESS' }),
    ]);
  });

  it('treats a legal unknown synthesis as a weak failure instead of rejecting it', () => {
    let state = battle([
      card('red', 'alchemist_001'),
      card('white', 'alchemist_004'),
      card('synthesis', 'alchemist_008'),
    ]);
    state = apply(
      state,
      client(1, {
        ...play('synthesis'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['red', 'white'] as CardInstanceId[],
          },
        ],
      }),
    );
    expect(state.players[0]).toMatchObject({ block: 2, synthesisCount: 1 });
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'SYNTHESIS_RESOLVED', result: 'FAILURE' }),
    );
  });

  it('generates a versioned discounted result for a matching catalyst recipe', () => {
    let state = battle([
      card('red', 'alchemist_001'),
      card('catalyst', 'alchemist_003'),
      card('synthesis', 'alchemist_008'),
    ]);
    state = apply(
      state,
      client(1, {
        ...play('synthesis'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['red', 'catalyst'] as CardInstanceId[],
          },
        ],
      }),
    );
    expect(state.players[0]!.hand).toContainEqual(
      expect.objectContaining({
        id: 'generated:1',
        definitionId: 'alchemist_005',
        definitionVersion: '1.0.0',
        costModifier: -1,
      }),
    );
  });

  it('always generates the pre-release 1.0.0 recipe output', () => {
    const versionTwo = {
      ...definitions.find((entry) => entry.id === 'alchemist_005')!,
      version: '2.0.0',
    };
    let state = battle([
      card('red', 'alchemist_001'),
      card('catalyst', 'alchemist_003'),
      card('synthesis', 'alchemist_008'),
    ]);
    const result = applyBattleInputV2(
      state,
      client(1, {
        ...play('synthesis'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['red', 'catalyst'] as CardInstanceId[],
          },
        ],
      }),
      [versionTwo, ...definitions],
      () => true,
    );
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
    expect(state.players[0]!.hand).toContainEqual(
      expect.objectContaining({ id: 'generated:1', definitionVersion: '1.0.0' }),
    );
  });

  it('requires an authoritative recipe choice when solvent matches multiple recipes', () => {
    const initial = battle([
      card('catalyst', 'alchemist_003'),
      card('solvent', 'alchemist_014'),
      card('synthesis', 'alchemist_008'),
    ]);
    const withoutRecipe = applyBattleInputV2(
      initial,
      client(1, {
        ...play('synthesis'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['catalyst', 'solvent'] as CardInstanceId[],
          },
        ],
      }),
      definitions,
    );
    expect(withoutRecipe).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CHOICE' },
    });

    const state = apply(
      initial,
      client(1, {
        ...play('synthesis'),
        choices: [
          {
            kind: 'CARD_INSTANCES',
            cardInstanceIds: ['catalyst', 'solvent'] as CardInstanceId[],
          },
          { kind: 'RECIPE', recipeId: 'ALCHEMY_BLUE_CATALYST' },
        ],
      }),
    );
    expect(state.players[0]!.hand).toContainEqual(
      expect.objectContaining({
        definitionId: 'alchemist_006',
        definitionVersion: '1.0.0',
        costModifier: -1,
      }),
    );
  });

  it('moves a grimoire to the draw-pile bottom and consumes its next-hit defense', () => {
    let state = battle(
      [card('seal', 'mage_019'), card('book', 'mage_019')],
      [card('attack', 'test_attack')],
    );
    state = apply(
      state,
      client(1, {
        ...play('seal'),
        choices: [{ kind: 'CARD_INSTANCES', cardInstanceIds: ['book' as CardInstanceId] }],
      }),
    );
    expect(state.players[0]!.drawPile.at(-1)?.id).toBe('book');
    expect(state.players[0]!.statuses).toContainEqual({ id: 'MAGE_GRIMOIRE_SEAL', stacks: 5 });
    state = apply(state, client(2, { type: 'END_TURN', playerId: playerOne }));
    state = apply(
      state,
      client(3, {
        type: 'PLAY_CARD',
        playerId: playerTwo,
        cardInstanceId: 'attack' as CardInstanceId,
      }),
    );
    expect(state.players[0]).toMatchObject({ hp: 30, statuses: [] });
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'DAMAGE_PREVENTED', amount: 1 }),
    );
  });

  it('stops special synthesis immediately after a lethal damage hit', () => {
    for (const synthesisId of ['complete-reaction', 'grand-synthesis']) {
      const definitionId = synthesisId === 'complete-reaction' ? 'alchemist_011' : 'alchemist_013';
      let state = battle([
        card('red', 'alchemist_001'),
        card('blue', 'alchemist_002'),
        card('white', 'alchemist_004'),
        card(synthesisId, definitionId),
      ]);
      state = {
        ...withEnergy(state, playerOne, 10),
        players: [state.players[0]!, { ...state.players[1]!, hp: 4 }],
      };
      const choices =
        definitionId === 'alchemist_011'
          ? [
              {
                kind: 'CARD_INSTANCES' as const,
                cardInstanceIds: ['red', 'blue', 'white'] as CardInstanceId[],
              },
            ]
          : undefined;
      state = apply(
        state,
        client(1, choices === undefined ? play(synthesisId) : { ...play(synthesisId), choices }),
      );
      expect(calculateResultV2(state)).toMatchObject({ reason: 'HP_DEPLETION' });
      expect(state.players[0]!.block).toBe(0);
      expect(
        state.events.filter((event) => event.type === 'HEALED' || event.type === 'BLOCK_GAINED'),
      ).toEqual([]);
    }
  });

  it('exhausts a hand card, searches by its actual cost, and shuffles after transformation', () => {
    let state = battle(
      [
        card('transform', 'alchemist_007'),
        card('material', 'alchemist_004'),
        card('candidate', 'alchemist_001'),
        card('too-expensive', 'mage_015'),
      ],
      [],
      2,
    );
    state = apply(
      state,
      client(1, {
        ...play('transform'),
        choices: [{ kind: 'CARD_INSTANCES', cardInstanceIds: ['material' as CardInstanceId] }],
      }),
    );
    expect(state.players[0]!.exhaust.map((entry) => entry.id)).toEqual(['material']);
    expect(state.pendingCardChoice?.candidateIds).toEqual(['candidate']);
    expect(state.events.filter((event) => event.type === 'DECK_CARD_REVEALED')).toHaveLength(2);

    state = apply(state, {
      inputSequence: 2,
      kind: 'SERVER_COMMAND',
      payload: {
        type: 'CARD_CHOICE_DEADLINE_ISSUED',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        issuedAt: 1_790_640_000_000,
        deadlineAt: 1_790_640_060_000,
        timeoutAuthorization: 'signed-deadline',
      },
    });
    state = apply(
      state,
      client(3, {
        type: 'SUBMIT_CARD_CHOICE',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        choice: { kind: 'CARD', cardInstanceId: 'candidate' as CardInstanceId },
      }),
    );
    expect(state.players[0]!.hand.map((entry) => entry.id)).toContain('candidate');
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'DECK_SHUFFLED', reason: 'ALCHEMY_TRANSFORM' }),
    );
  });

  it('recycles the discard pile before an empty-pile transformation search', () => {
    let state = battle(
      [card('transform', 'alchemist_007'), card('material', 'alchemist_004')],
      [],
      2,
    );
    state = {
      ...state,
      players: [
        { ...state.players[0]!, discard: [card('candidate', 'alchemist_001')] },
        state.players[1]!,
      ],
    };
    state = apply(
      state,
      client(1, {
        ...play('transform'),
        choices: [{ kind: 'CARD_INSTANCES', cardInstanceIds: ['material' as CardInstanceId] }],
      }),
    );
    expect(state.pendingCardChoice?.candidateIds).toEqual(['candidate']);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: 'DECK_SHUFFLED', reason: 'DRAW_PILE_EMPTY' }),
    );
  });

  it('reserves generated card IDs for engine-created instances', () => {
    expect(() => battle([card('generated:1', 'alchemist_001')])).toThrow(
      'Initial card instance IDs cannot use the generated: prefix.',
    );
  });

  it('uses HP terminal results before special victory and floors percentage calculations', () => {
    const state = battle([]);
    expect(
      calculateResultV2({
        ...state,
        players: state.players.map((player) => ({ ...player, hp: 0 })),
        terminalResult: {
          status: 'WIN',
          winnerId: playerOne,
          reason: 'SPECIAL_VICTORY',
          specialVictoryId: 'MAGE_GRAND_WISH',
        },
      }),
    ).toEqual({ status: 'DRAW', reason: 'SIMULTANEOUS_HP_DEPLETION' });
    expect(applyPercentageFloor(5, 50)).toBe(2);
    expect(applyPercentageFloor(7, 33)).toBe(2);
  });

  it('ends by normal HP victory and cancels unfinished chants', () => {
    let state = withEnergy(
      battle([card('wish', 'mage_017')], [card('lethal', 'test_lethal')]),
      playerOne,
      10,
    );
    state = apply(state, client(1, play('wish')));
    state = apply(state, client(2, { type: 'END_TURN', playerId: playerOne }));
    state = apply(
      state,
      client(3, {
        type: 'PLAY_CARD',
        playerId: playerTwo,
        cardInstanceId: 'lethal' as CardInstanceId,
      }),
    );
    expect(calculateResultV2(state)).toEqual({
      status: 'WIN',
      winnerId: playerTwo,
      reason: 'HP_DEPLETION',
    });
    expect(state.chantQueue).toEqual([]);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'CHANT_CANCELLED' }));
    expect(state.events).not.toContainEqual(expect.objectContaining({ type: 'CHANT_DELAYED' }));
  });

  it('rejects the Alchemist completion card before stage 3', () => {
    const state = battle([card('complete', 'alchemist_017')]);
    expect(applyBattleInputV2(state, client(1, play('complete')), definitions)).toMatchObject({
      ok: false,
      state,
      events: [],
      error: { code: 'INVALID_ALCHEMY_STAGE' },
    });
  });

  it('allows energy above max and deterministically rebuilds an empty draw pile', () => {
    let state = battle([card('energy', 'test_energy'), card('draw', 'test_draw')]);
    state = {
      ...state,
      players: [
        {
          ...state.players[0]!,
          drawPile: [],
          discard: [card('discard-a', 'alchemist_001'), card('discard-b', 'alchemist_002')],
        },
        state.players[1]!,
      ],
    };
    state = apply(state, client(1, play('energy')));
    expect(state.players[0]!.energy).toBe(5);
    state = apply(state, client(2, play('draw')));
    expect(state.players[0]!.hand).toHaveLength(2);
    expect(state.players[0]!.discard.map((entry) => entry.id)).toEqual(['draw']);
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'DECK_SHUFFLED' }));
  });

  it('redacts owner-only card identities from the opponent state projection', () => {
    const state = battle([card('private-card', 'mage_019')]);
    const projected = projectBattleStateV2(state, playerTwo) as {
      readonly players: readonly { readonly hand: readonly unknown[] }[];
      readonly seed?: string;
      readonly rngState?: number;
    };
    expect(projected.players[0]!.hand).toEqual([{ visibility: 'ownerOnly' }]);
    expect(projected).not.toHaveProperty('seed');
    expect(projected).not.toHaveProperty('rngState');
  });

  it('publishes a played card definition and keeps it public in discard', () => {
    const state = apply(battle([card('attack', 'test_attack')]), client(1, play('attack')));
    expect(state.players[0]!.discard).toContainEqual(
      expect.objectContaining({
        id: 'attack',
        definitionId: 'test_attack',
        definitionVersion: '1.0.0',
        visibility: 'allPlayers',
      }),
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: 'CARD_PLAYED',
        cardInstanceId: 'attack',
        definitionId: 'test_attack',
        definitionVersion: '1.0.0',
        visibility: 'allPlayers',
      }),
    );
  });

  it('returns structured failures for malformed and sparse protocol payloads', () => {
    const state = battle([card('attack', 'test_attack')]);
    const malformedChoices = {
      inputSequence: 1,
      kind: 'CLIENT_ACTION',
      payload: { ...play('attack'), choices: {} },
    } as unknown as BattleInput;
    expect(applyBattleInputV2(state, malformedChoices, definitions)).toMatchObject({
      ok: false,
      error: { code: 'MALFORMED_INPUT' },
    });

    const sparseAction = {
      ...play('attack'),
      choices: new Array(1),
    } as unknown as PlayCardActionV2;
    expect(applyBattleInputV2(state, client(1, sparseAction), definitions)).toMatchObject({
      ok: false,
      error: { code: 'MALFORMED_INPUT' },
    });

    const malformedCommand = {
      inputSequence: 1,
      kind: 'SERVER_COMMAND',
      payload: {
        type: 'CARD_CHOICE_DEADLINE_ISSUED',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        issuedAt: 'now',
        deadlineAt: 'later',
        timeoutAuthorization: 'signed',
      },
    } as unknown as BattleInput;
    expect(applyBattleInputV2(state, malformedCommand, definitions)).toMatchObject({
      ok: false,
      error: { code: 'MALFORMED_INPUT' },
    });
  });
});

describe('Replay format 2 and pending choices', () => {
  it('uses the standard SHA-256 digest for immutable definition revisions', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('records and verifies the merged client/server input sequence', () => {
    const initial = battle(
      [card('search', 'test_search'), card('candidate', 'alchemist_001')],
      [],
      1,
    );
    const inputs: readonly BattleInput[] = [
      client(1, play('search')),
      {
        inputSequence: 2,
        kind: 'SERVER_COMMAND',
        payload: {
          type: 'CARD_CHOICE_DEADLINE_ISSUED',
          playerId: playerOne,
          choiceRequestId: 'choice:1',
          issuedAt: 1_790_640_000_000,
          deadlineAt: 1_790_640_060_000,
          timeoutAuthorization: 'signed-deadline',
        },
      },
      client(3, {
        type: 'SUBMIT_CARD_CHOICE',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        choice: { kind: 'CARD', cardInstanceId: 'candidate' as CardInstanceId },
      }),
    ];
    const revision = calculateDraftDefinitionRevision(definitions);
    const recorded = recordReplayV2(initial, inputs, definitions, {
      draftDefinitionRevision: revision,
      battleProtocolVersion: 2,
      snapshotInterval: 1,
      authorizeServerCommand: () => true,
    });
    expect(recorded).toMatchObject({ ok: true });
    if (!recorded.ok) return;
    expect(recorded.replay.actions.map((record) => record.inputSequence)).toEqual([1, 3]);
    expect(recorded.replay.serverCommands.map((record) => record.inputSequence)).toEqual([2]);
    expect(recorded.replay.snapshots.map((snapshot) => snapshot.inputSequence)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(
      verifyReplayV2(
        recorded.replay,
        () => definitions,
        () => true,
      ),
    ).toEqual({ ok: true });
    expect(
      verifyReplayV2(
        recorded.replay,
        () => definitions,
        () => false,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });

    const commandTampered: ReplayV2 = {
      ...recorded.replay,
      serverCommands: recorded.replay.serverCommands.map((record) => ({
        ...record,
        payload: { ...record.payload, timeoutAuthorization: 'changed-authorization' },
      })),
    };
    expect(
      verifyReplayV2(
        commandTampered,
        () => definitions,
        () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CHECKSUM_MISMATCH' } });

    const { events: initialEvents, ...initialStateRest } = recorded.replay.initialState;
    const reordered: ReplayV2 = {
      ...recorded.replay,
      initialState: { events: initialEvents, ...initialStateRest },
    };
    expect(
      verifyReplayV2(
        reordered,
        () => definitions,
        () => true,
      ),
    ).toEqual({ ok: true });
  });

  it('ends the turn after an authorized pending choice timeout', () => {
    let state = battle([card('search', 'test_search'), card('candidate', 'alchemist_001')], [], 1);
    state = apply(state, client(1, play('search')));
    state = apply(state, {
      inputSequence: 2,
      kind: 'SERVER_COMMAND',
      payload: {
        type: 'CARD_CHOICE_DEADLINE_ISSUED',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        issuedAt: 1_790_640_000_000,
        deadlineAt: 1_790_640_060_000,
        timeoutAuthorization: 'signed-deadline',
      },
    });
    state = apply(state, {
      inputSequence: 3,
      kind: 'SERVER_COMMAND',
      payload: {
        type: 'CARD_CHOICE_TIMEOUT',
        playerId: playerOne,
        choiceRequestId: 'choice:1',
        deadlineCommandSequence: 2,
        deadlineAt: 1_790_640_060_000,
        timeoutAt: 1_790_640_060_000,
        timeoutAuthorization: 'signed-deadline',
        timeoutAttestation: 'signed-timeout',
      },
    });
    expect(state).toMatchObject({
      phase: 'PLAYER_TURN',
      activePlayerId: playerTwo,
      pendingCardChoice: undefined,
    });
    expect(state.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['CARD_CHOICE_TIMED_OUT', 'TURN_ENDED', 'TURN_STARTED']),
    );
  });

  it('rejects a replay that leaves a pending choice without its deadline command', () => {
    const initial = battle(
      [card('search', 'test_search'), card('candidate', 'alchemist_001')],
      [],
      1,
    );
    const revision = calculateDraftDefinitionRevision(definitions);
    expect(
      recordReplayV2(initial, [client(1, play('search'))], definitions, {
        draftDefinitionRevision: revision,
        battleProtocolVersion: 2,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'INPUT_REJECTED' },
    });
  });

  it('binds the exact definition snapshot digest and detects content tampering', () => {
    const revision = calculateDraftDefinitionRevision(definitions);
    expect(revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(calculateDraftDefinitionRevision([...definitions].reverse())).toBe(revision);
    const result = recordReplayV2(battle([]), [], definitions, {
      draftDefinitionRevision: revision,
      battleProtocolVersion: 2,
    });
    if (!result.ok) throw new Error(result.error.message);
    const tampered = {
      ...result.replay,
      finalState: {
        ...result.replay.finalState,
        players: [
          { ...result.replay.finalState.players[0]!, hp: 29 },
          result.replay.finalState.players[1]!,
        ],
      },
    };
    expect(
      verifyReplayV2(
        tampered,
        () => definitions,
        () => true,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'CHECKSUM_MISMATCH' },
    });
    const recalculated = {
      ...tampered,
      checksum: calculateReplayV2Checksum(tampered as ReplayV2),
    };
    expect(
      verifyReplayV2(
        recalculated,
        () => definitions,
        () => true,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'REPLAY_MISMATCH' },
    });
  });

  it('rejects a forged terminal result in the replay initial state', () => {
    const initial = battle([]);
    const forged: BattleStateV2 = {
      ...initial,
      phase: 'MATCH_END',
      terminalResult: {
        status: 'WIN',
        winnerId: playerOne,
        reason: 'SPECIAL_VICTORY',
        specialVictoryId: 'MAGE_GRAND_WISH',
      },
    };
    expect(
      recordReplayV2(forged, [], definitions, {
        draftDefinitionRevision: calculateDraftDefinitionRevision(definitions),
        battleProtocolVersion: 2,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_RECORDING_OPTIONS' },
    });
  });
});

function battle(
  firstDeck: readonly CardInstanceV2[],
  secondDeck: readonly CardInstanceV2[] = [],
  initialDrawCount = firstDeck.length,
): BattleStateV2 {
  return createInitialBattleStateV2({
    matchId: 'match-v2' as MatchId,
    engineVersion: '2.0.0',
    rulesVersion: '2.0.0',
    cardDataVersion: '1.0.0',
    seed: 'protocol-v2-seed',
    initialDrawCount,
    turnDrawCount: 1,
    players: [
      { id: playerOne, drawPile: firstDeck },
      { id: playerTwo, drawPile: secondDeck },
    ],
  });
}

function definition(
  id: string,
  cost: number,
  effects: CardDefinitionV2['effects'],
  keywords: readonly string[] = [],
): CardDefinitionV2 {
  return { id, version: '1.0.0', cost, effects, keywords, deckLimit: 3 };
}

function card(id: string, definitionId: string): CardInstanceV2 {
  return {
    id: id as CardInstanceId,
    definitionId,
    definitionVersion: '1.0.0',
    costModifier: 0,
    visibility: 'ownerOnly',
  };
}

function client(
  inputSequence: number,
  payload: Extract<BattleInput, { kind: 'CLIENT_ACTION' }>['payload'],
): BattleInput {
  return { inputSequence, kind: 'CLIENT_ACTION', payload };
}

function play(id: string): PlayCardActionV2 {
  return {
    type: 'PLAY_CARD',
    playerId: playerOne,
    cardInstanceId: id as CardInstanceId,
  };
}

function apply(state: BattleStateV2, input: BattleInput): BattleStateV2 {
  const result = applyBattleInputV2(state, input, definitions, () => true);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.state;
}

function withEnergy(state: BattleStateV2, playerId: PlayerId, energy: number): BattleStateV2 {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, energy } : player,
    ),
  };
}

function allZoneIds(state: BattleStateV2, playerId: PlayerId): readonly string[] {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  return [...player.drawPile, ...player.hand, ...player.discard, ...player.exhaust].map(
    (entry) => entry.id,
  );
}
