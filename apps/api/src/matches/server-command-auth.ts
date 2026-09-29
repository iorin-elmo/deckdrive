import type {
  BattleStateV2,
  CardChoiceDeadlineIssuedCommand,
  CardChoiceTimeoutCommand,
  ServerCommandAuthorizer,
} from '@deck-drive/game-engine';
import { matchesSignature, sign } from '../auth/crypto.js';

const minimumSecretLength = 32;

export function createServerCommandAuthorizer(secret: string): ServerCommandAuthorizer {
  assertCommandSecret(secret);
  return (state, input) => {
    const command = input.payload;
    if (command.type === 'CARD_CHOICE_DEADLINE_ISSUED') {
      return matchesSignature(
        deadlineAuthorizationPayload(state, input.inputSequence, command),
        command.timeoutAuthorization,
        secret,
      );
    }
    return matchesSignature(
      timeoutAttestationPayload(state, input.inputSequence, command),
      command.timeoutAttestation,
      secret,
    );
  };
}

export function serverCommandAuthorizerFromEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerCommandAuthorizer | undefined {
  const secret = environment.BATTLE_COMMAND_SECRET?.trim();
  return secret === undefined || secret.length === 0
    ? undefined
    : createServerCommandAuthorizer(secret);
}

export function signDeadlineAuthorization(
  state: BattleStateV2,
  inputSequence: number,
  command: Omit<CardChoiceDeadlineIssuedCommand, 'timeoutAuthorization'>,
  secret: string,
): string {
  assertCommandSecret(secret);
  return sign(deadlineAuthorizationPayload(state, inputSequence, command), secret);
}

export function signTimeoutAttestation(
  state: BattleStateV2,
  inputSequence: number,
  command: Omit<CardChoiceTimeoutCommand, 'timeoutAttestation'>,
  secret: string,
): string {
  assertCommandSecret(secret);
  return sign(timeoutAttestationPayload(state, inputSequence, command), secret);
}

function deadlineAuthorizationPayload(
  state: BattleStateV2,
  inputSequence: number,
  command: Omit<CardChoiceDeadlineIssuedCommand, 'timeoutAuthorization'>,
): string {
  return JSON.stringify([
    'deckdrive:battle-command:deadline:v1',
    state.matchId,
    inputSequence,
    command.playerId,
    command.choiceRequestId,
    command.issuedAt,
    command.deadlineAt,
  ]);
}

function timeoutAttestationPayload(
  state: BattleStateV2,
  inputSequence: number,
  command: Omit<CardChoiceTimeoutCommand, 'timeoutAttestation'>,
): string {
  return JSON.stringify([
    'deckdrive:battle-command:timeout:v1',
    state.matchId,
    inputSequence,
    command.playerId,
    command.choiceRequestId,
    command.deadlineCommandSequence,
    command.deadlineAt,
    command.timeoutAt,
    command.timeoutAuthorization,
  ]);
}

function assertCommandSecret(secret: string): void {
  if (secret.length < minimumSecretLength) {
    throw new Error(
      `BATTLE_COMMAND_SECRET must be at least ${String(minimumSecretLength)} characters.`,
    );
  }
}
