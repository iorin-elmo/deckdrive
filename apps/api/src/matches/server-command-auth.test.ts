import { describe, expect, it } from 'vitest';

import {
  applyBattleInputV2,
  createInitialBattleStateV2,
  projectBattleStateV2,
  type BattleInput,
  type CardDefinitionV2,
  type CardInstanceId,
  type MatchId,
  type PlayerId,
} from '@deck-drive/game-engine';

import {
  createServerCommandAuthorizer,
  serverCommandAuthorizerFromEnvironment,
  signDeadlineAuthorization,
  signTimeoutAttestation,
} from './server-command-auth.js';

const secret = 'battle-command-secret-with-32-characters';
const playerOne = 'player-one' as PlayerId;
const playerTwo = 'player-two' as PlayerId;
const definitions: readonly CardDefinitionV2[] = [
  {
    id: 'search',
    version: '1.0.0',
    cost: 0,
    effects: [{ type: 'REQUEST_CARD_CHOICE', from: 'DRAW_PILE' }],
  },
  {
    id: 'candidate',
    version: '1.0.0',
    cost: 0,
    effects: [{ type: 'GAIN_BLOCK', amount: 1, target: 'SELF' }],
  },
];

describe('battle server-command authorization', () => {
  it('verifies signed deadline and timeout commands and rejects tampering', () => {
    let state = initialState();
    const played = applyBattleInputV2(
      state,
      {
        inputSequence: 1,
        kind: 'CLIENT_ACTION',
        payload: {
          type: 'PLAY_CARD',
          playerId: playerOne,
          cardInstanceId: 'search-card' as CardInstanceId,
        },
      },
      definitions,
    );
    if (!played.ok) throw new Error(played.error.message);
    state = played.state;

    const unsignedDeadline = {
      type: 'CARD_CHOICE_DEADLINE_ISSUED' as const,
      playerId: playerOne,
      choiceRequestId: 'choice:1',
      issuedAt: 1_790_640_000_000,
      deadlineAt: 1_790_640_060_000,
    };
    const timeoutAuthorization = signDeadlineAuthorization(state, 2, unsignedDeadline, secret);
    const deadlineInput: Extract<BattleInput, { kind: 'SERVER_COMMAND' }> = {
      inputSequence: 2,
      kind: 'SERVER_COMMAND',
      payload: { ...unsignedDeadline, timeoutAuthorization },
    };
    const authorizer = createServerCommandAuthorizer(secret);
    expect(authorizer(state, deadlineInput)).toBe(true);
    const deadline = applyBattleInputV2(state, deadlineInput, definitions, authorizer);
    if (!deadline.ok) throw new Error(deadline.error.message);
    state = deadline.state;
    expect(
      (projectBattleStateV2(state, playerOne) as { pendingCardChoice: Record<string, unknown> })
        .pendingCardChoice,
    ).not.toHaveProperty('deadlineCommitment');

    const unsignedTimeout = {
      type: 'CARD_CHOICE_TIMEOUT' as const,
      playerId: playerOne,
      choiceRequestId: 'choice:1',
      deadlineCommandSequence: 2,
      deadlineAt: 1_790_640_060_000,
      timeoutAt: 1_790_640_060_000,
      timeoutAuthorization,
    };
    const signedTimeout = {
      ...unsignedTimeout,
      timeoutAttestation: signTimeoutAttestation(state, 3, unsignedTimeout, secret),
    };
    const timeoutInput: Extract<BattleInput, { kind: 'SERVER_COMMAND' }> = {
      inputSequence: 3,
      kind: 'SERVER_COMMAND',
      payload: signedTimeout,
    };
    expect(authorizer(state, timeoutInput)).toBe(true);
    expect(
      authorizer(state, {
        ...timeoutInput,
        payload: { ...signedTimeout, timeoutAt: signedTimeout.timeoutAt + 1 },
      }),
    ).toBe(false);

    const earlierDeadline = {
      ...unsignedDeadline,
      issuedAt: unsignedDeadline.issuedAt - 60_000,
      deadlineAt: unsignedDeadline.deadlineAt - 60_000,
    };
    const substitutedTimeout = {
      ...unsignedTimeout,
      deadlineAt: earlierDeadline.deadlineAt,
      timeoutAt: earlierDeadline.deadlineAt,
      timeoutAuthorization: signDeadlineAuthorization(state, 2, earlierDeadline, secret),
    };
    const substitutedInput: Extract<BattleInput, { kind: 'SERVER_COMMAND' }> = {
      inputSequence: 3,
      kind: 'SERVER_COMMAND',
      payload: {
        ...substitutedTimeout,
        timeoutAttestation: signTimeoutAttestation(state, 3, substitutedTimeout, secret),
      },
    };
    expect(authorizer(state, substitutedInput)).toBe(false);
    expect(applyBattleInputV2(state, substitutedInput, definitions, authorizer)).toMatchObject({
      ok: false,
      state,
      error: { code: 'INVALID_SERVER_COMMAND' },
    });
    expect(applyBattleInputV2(state, timeoutInput, definitions, authorizer)).toMatchObject({
      ok: true,
    });
    const rotatedAuthorizer = serverCommandAuthorizerFromEnvironment({
      BATTLE_COMMAND_SECRET: 'new-battle-command-secret-with-32-characters',
      BATTLE_COMMAND_PREVIOUS_SECRETS: secret,
    });
    expect(rotatedAuthorizer?.(state, timeoutInput)).toBe(true);
  });

  it('loads the verifier only from a sufficiently strong configured secret', () => {
    expect(serverCommandAuthorizerFromEnvironment({})).toBeUndefined();
    expect(() =>
      serverCommandAuthorizerFromEnvironment({ BATTLE_COMMAND_SECRET: 'short' }),
    ).toThrow('BATTLE_COMMAND_SECRET');
    expect(serverCommandAuthorizerFromEnvironment({ BATTLE_COMMAND_SECRET: secret })).toEqual(
      expect.any(Function),
    );
  });
});

function initialState() {
  return createInitialBattleStateV2({
    matchId: 'auth-match' as MatchId,
    engineVersion: '2.0.0',
    rulesVersion: '2.0.0',
    cardDataVersion: '1.0.0',
    seed: 'auth-seed',
    initialDrawCount: 1,
    turnDrawCount: 1,
    players: [
      {
        id: playerOne,
        drawPile: [
          {
            id: 'search-card' as CardInstanceId,
            definitionId: 'search',
            definitionVersion: '1.0.0',
            costModifier: 0,
            visibility: 'ownerOnly',
          },
          {
            id: 'candidate-card' as CardInstanceId,
            definitionId: 'candidate',
            definitionVersion: '1.0.0',
            costModifier: 0,
            visibility: 'ownerOnly',
          },
        ],
      },
      { id: playerTwo, drawPile: [] },
    ],
  });
}
