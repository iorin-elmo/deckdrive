import {
  applyBattleInputV2,
  battleProtocolVersion,
  createInitialBattleStateV2,
} from './protocol-v2.js';
import type {
  BattleInput,
  BattleStateV2,
  CardDefinitionV2,
  GameActionV2,
  GameEventV2,
  ServerCommand,
  ServerCommandAuthorizer,
} from './protocol-v2.js';
import { sha256Hex } from './sha256.js';

export const replayFormatVersionV2 = 2 as const;

export interface BattleInputRecord<T> {
  readonly inputSequence: number;
  readonly payload: T;
}

export interface ReplaySnapshotV2 {
  readonly inputSequence: number;
  readonly eventSequence: number;
  readonly state: Omit<BattleStateV2, 'events'>;
}

export interface ReplayV2 {
  readonly formatVersion: typeof replayFormatVersionV2;
  readonly battleProtocolVersion: typeof battleProtocolVersion;
  readonly draftDefinitionRevision: string;
  readonly matchId: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly initialState: BattleStateV2;
  readonly actions: readonly BattleInputRecord<GameActionV2>[];
  readonly serverCommands: readonly BattleInputRecord<ServerCommand>[];
  readonly events: readonly GameEventV2[];
  readonly snapshots: readonly ReplaySnapshotV2[];
  readonly finalState: BattleStateV2;
  readonly snapshotInterval: number;
  readonly checksum: string;
}

export interface ReplayV2RecordingOptions {
  readonly draftDefinitionRevision: string;
  readonly battleProtocolVersion: typeof battleProtocolVersion;
  readonly snapshotInterval?: number;
  readonly authorizeServerCommand?: ServerCommandAuthorizer;
}

export type ReplayV2RecordingResult =
  | { readonly ok: true; readonly replay: ReplayV2 }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          'INVALID_DEFINITION_REVISION' | 'INPUT_REJECTED' | 'INVALID_RECORDING_OPTIONS';
        readonly message: string;
        readonly inputSequence?: number;
      };
    };

export type ReplayV2VerificationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | 'CHECKSUM_MISMATCH'
          | 'DEFINITION_SNAPSHOT_NOT_FOUND'
          | 'DEFINITION_REVISION_MISMATCH'
          | 'REPLAY_MISMATCH';
        readonly message: string;
      };
    };

export type DefinitionSnapshotRegistry = (
  revision: string,
) => readonly CardDefinitionV2[] | undefined;

export function calculateDraftDefinitionRevision(definitions: readonly CardDefinitionV2[]): string {
  validateDefinitionSnapshot(definitions);
  const sorted = [...definitions].sort((left, right) =>
    left.id === right.id
      ? compareCodePoints(left.version, right.version)
      : compareCodePoints(left.id, right.id),
  );
  return `sha256:${sha256Hex(canonicalJsonV2(sorted))}`;
}

export function recordReplayV2(
  initialState: BattleStateV2,
  inputs: readonly BattleInput[],
  definitionSnapshot: readonly CardDefinitionV2[],
  options: ReplayV2RecordingOptions,
): ReplayV2RecordingResult {
  const snapshotInterval = options.snapshotInterval ?? 1;
  if (
    options.battleProtocolVersion !== battleProtocolVersion ||
    !Number.isSafeInteger(snapshotInterval) ||
    snapshotInterval < 1 ||
    initialState.battleProtocolVersion !== battleProtocolVersion ||
    initialState.lastInputSequence !== 0 ||
    !Array.isArray(inputs) ||
    !dense(inputs)
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_RECORDING_OPTIONS',
        message:
          'Replay V2 requires protocol 2, an initial input boundary of zero, and a positive snapshot interval.',
      },
    };
  }
  let actualRevision: string;
  try {
    actualRevision = calculateDraftDefinitionRevision(definitionSnapshot);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'INVALID_DEFINITION_REVISION', message: errorMessage(error) },
    };
  }
  if (actualRevision !== options.draftDefinitionRevision) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DEFINITION_REVISION',
        message: 'The supplied revision does not match the immutable definition snapshot.',
      },
    };
  }
  const initialStateError = validateInitialState(initialState, definitionSnapshot);
  if (initialStateError !== undefined) {
    return {
      ok: false,
      error: { code: 'INVALID_RECORDING_OPTIONS', message: initialStateError },
    };
  }

  let state = structuredClone(initialState);
  const snapshots: ReplaySnapshotV2[] = [snapshotV2(0, state)];
  const actions: BattleInputRecord<GameActionV2>[] = [];
  const serverCommands: BattleInputRecord<ServerCommand>[] = [];
  let pendingDeadline:
    | {
        readonly inputSequence: number;
        readonly choiceRequestId: string;
        readonly playerId: string;
        readonly deadlineAt: number;
        readonly timeoutAuthorization: string;
      }
    | undefined;
  for (const input of inputs) {
    const result = applyBattleInputV2(
      state,
      input,
      definitionSnapshot,
      options.authorizeServerCommand,
    );
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'INPUT_REJECTED',
          message: result.error.message,
          ...(isRecord(input) && Number.isSafeInteger(input.inputSequence)
            ? { inputSequence: input.inputSequence as number }
            : {}),
        },
      };
    }
    const protocolError = validatePendingInputOrder(state, input, pendingDeadline);
    if (protocolError !== undefined) {
      return {
        ok: false,
        error: {
          code: 'INPUT_REJECTED',
          message: protocolError,
          inputSequence: input.inputSequence,
        },
      };
    }
    state = result.state;
    if (input.kind === 'SERVER_COMMAND' && input.payload.type === 'CARD_CHOICE_DEADLINE_ISSUED') {
      pendingDeadline = {
        inputSequence: input.inputSequence,
        choiceRequestId: input.payload.choiceRequestId,
        playerId: input.payload.playerId,
        deadlineAt: input.payload.deadlineAt,
        timeoutAuthorization: input.payload.timeoutAuthorization,
      };
    } else if (
      state.pendingCardChoice === undefined ||
      state.pendingCardChoice.choiceRequestId !== pendingDeadline?.choiceRequestId
    ) {
      pendingDeadline = undefined;
    }
    if (input.kind === 'CLIENT_ACTION')
      actions.push({ inputSequence: input.inputSequence, payload: input.payload });
    else serverCommands.push({ inputSequence: input.inputSequence, payload: input.payload });
    if (input.inputSequence % snapshotInterval === 0 || input.inputSequence === inputs.length) {
      snapshots.push(snapshotV2(input.inputSequence, state));
    }
  }
  if (state.pendingCardChoice !== undefined && pendingDeadline === undefined) {
    return {
      ok: false,
      error: {
        code: 'INPUT_REJECTED',
        message: 'A pending choice must be followed by its persisted deadline command.',
      },
    };
  }
  const content: Omit<ReplayV2, 'checksum'> = {
    formatVersion: replayFormatVersionV2,
    battleProtocolVersion,
    draftDefinitionRevision: actualRevision,
    matchId: initialState.matchId,
    engineVersion: initialState.engineVersion,
    rulesVersion: initialState.rulesVersion,
    cardDataVersion: initialState.cardDataVersion,
    seed: initialState.seed,
    initialState: structuredClone(initialState),
    actions,
    serverCommands,
    events: state.events,
    snapshots,
    finalState: state,
    snapshotInterval,
  };
  return { ok: true, replay: { ...content, checksum: calculateReplayV2Checksum(content) } };
}

export function verifyReplayV2(
  replay: ReplayV2,
  definitionSnapshots: DefinitionSnapshotRegistry,
  authorizeServerCommand: ServerCommandAuthorizer,
): ReplayV2VerificationResult {
  if (!isReplayV2Shape(replay)) return mismatch('Replay V2 has a malformed persisted shape.');
  const { checksum, ...content } = replay;
  let actualChecksum: string;
  try {
    actualChecksum = calculateReplayV2Checksum(content);
  } catch {
    return mismatch('Replay V2 contains unsupported or sparse JSON values.');
  }
  if (actualChecksum !== checksum) {
    return {
      ok: false,
      error: {
        code: 'CHECKSUM_MISMATCH',
        message: 'Replay V2 checksum does not match its content.',
      },
    };
  }
  const definitions = definitionSnapshots(replay.draftDefinitionRevision);
  if (definitions === undefined) {
    return {
      ok: false,
      error: {
        code: 'DEFINITION_SNAPSHOT_NOT_FOUND',
        message: 'The exact immutable definition snapshot is unavailable.',
      },
    };
  }
  let revision: string;
  try {
    revision = calculateDraftDefinitionRevision(definitions);
  } catch (error) {
    return {
      ok: false,
      error: { code: 'DEFINITION_REVISION_MISMATCH', message: errorMessage(error) },
    };
  }
  if (revision !== replay.draftDefinitionRevision) {
    return {
      ok: false,
      error: {
        code: 'DEFINITION_REVISION_MISMATCH',
        message: 'The registered definition snapshot digest does not match the replay revision.',
      },
    };
  }
  const inputs = mergeBattleInputRecords(replay.actions, replay.serverCommands);
  if (inputs === undefined)
    return mismatch('Replay V2 input sequences are duplicated or have gaps.');
  const recorded = recordReplayV2(replay.initialState, inputs, definitions, {
    draftDefinitionRevision: replay.draftDefinitionRevision,
    battleProtocolVersion: replay.battleProtocolVersion,
    snapshotInterval: replay.snapshotInterval,
    authorizeServerCommand,
  });
  if (!recorded.ok || !structurallyEqual(recorded.replay, replay)) {
    return mismatch('Replay V2 does not reproduce its events, snapshots, and final state.');
  }
  return { ok: true };
}

export function calculateReplayV2Checksum(replay: Omit<ReplayV2, 'checksum'> | ReplayV2): string {
  const content = { ...replay } as Record<string, unknown>;
  delete content.checksum;
  return `sha256:${sha256Hex(canonicalReplayJson(content))}`;
}

export function restoreReplaySnapshotV2(
  snapshot: ReplaySnapshotV2,
  events: readonly GameEventV2[],
): BattleStateV2 {
  return {
    ...structuredClone(snapshot.state),
    events: structuredClone(events.filter((event) => event.sequence <= snapshot.eventSequence)),
  };
}

function mergeBattleInputRecords(
  actions: readonly BattleInputRecord<GameActionV2>[],
  commands: readonly BattleInputRecord<ServerCommand>[],
): BattleInput[] | undefined {
  const inputs: BattleInput[] = [
    ...actions.map((record): BattleInput => ({
      inputSequence: record.inputSequence,
      kind: 'CLIENT_ACTION',
      payload: record.payload,
    })),
    ...commands.map((record): BattleInput => ({
      inputSequence: record.inputSequence,
      kind: 'SERVER_COMMAND',
      payload: record.payload,
    })),
  ].sort((left, right) => left.inputSequence - right.inputSequence);
  if (inputs.some((input, index) => input.inputSequence !== index + 1)) return undefined;
  return inputs;
}

function validatePendingInputOrder(
  state: BattleStateV2,
  input: BattleInput,
  deadline:
    | {
        readonly inputSequence: number;
        readonly choiceRequestId: string;
        readonly playerId: string;
        readonly deadlineAt: number;
        readonly timeoutAuthorization: string;
      }
    | undefined,
): string | undefined {
  const pending = state.pendingCardChoice;
  if (pending === undefined) return undefined;
  if (deadline === undefined) {
    if (
      input.kind !== 'SERVER_COMMAND' ||
      input.payload.type !== 'CARD_CHOICE_DEADLINE_ISSUED' ||
      input.payload.choiceRequestId !== pending.choiceRequestId ||
      input.payload.playerId !== pending.ownerPlayerId
    ) {
      return 'The input immediately after a pending choice must persist its matching deadline command.';
    }
    if (
      !isNonNegativeSafeInteger(input.payload.issuedAt) ||
      !isNonNegativeSafeInteger(input.payload.deadlineAt) ||
      input.payload.deadlineAt - input.payload.issuedAt !== 60_000 ||
      input.payload.timeoutAuthorization.length === 0
    ) {
      return 'A choice deadline must be a signed, valid 60-second interval.';
    }
    return undefined;
  }
  if (input.kind === 'CLIENT_ACTION') {
    return input.payload.type === 'SUBMIT_CARD_CHOICE' &&
      input.payload.choiceRequestId === pending.choiceRequestId &&
      input.payload.playerId === pending.ownerPlayerId
      ? undefined
      : 'Only the matching choice submission may follow an issued choice deadline.';
  }
  if (
    input.payload.type !== 'CARD_CHOICE_TIMEOUT' ||
    input.payload.choiceRequestId !== deadline.choiceRequestId ||
    input.payload.playerId !== deadline.playerId ||
    input.payload.deadlineCommandSequence !== deadline.inputSequence ||
    input.payload.deadlineAt !== deadline.deadlineAt ||
    input.payload.timeoutAuthorization !== deadline.timeoutAuthorization ||
    !isNonNegativeSafeInteger(input.payload.timeoutAt) ||
    input.payload.timeoutAt < deadline.deadlineAt ||
    input.payload.timeoutAttestation.length === 0
  ) {
    return 'The timeout command does not match the persisted deadline authorization.';
  }
  return undefined;
}

function snapshotV2(inputSequence: number, state: BattleStateV2): ReplaySnapshotV2 {
  const { events, ...snapshotState } = structuredClone(state);
  return { inputSequence, eventSequence: events.at(-1)?.sequence ?? 0, state: snapshotState };
}

function isReplayV2Shape(value: unknown): value is ReplayV2 {
  if (!isRecord(value)) return false;
  if (
    value.formatVersion !== replayFormatVersionV2 ||
    value.battleProtocolVersion !== battleProtocolVersion ||
    typeof value.draftDefinitionRevision !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.draftDefinitionRevision) ||
    typeof value.checksum !== 'string' ||
    !Number.isSafeInteger(value.snapshotInterval) ||
    (value.snapshotInterval as number) < 1 ||
    !Array.isArray(value.actions) ||
    !Array.isArray(value.serverCommands) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.snapshots) ||
    !isBattleStateV2(value.initialState) ||
    !isBattleStateV2(value.finalState)
  )
    return false;
  if (
    value.initialState.battleProtocolVersion !== value.battleProtocolVersion ||
    value.finalState.battleProtocolVersion !== value.battleProtocolVersion ||
    value.initialState.lastInputSequence !== 0 ||
    value.matchId !== value.initialState.matchId ||
    value.matchId !== value.finalState.matchId ||
    value.seed !== value.initialState.seed ||
    value.seed !== value.finalState.seed
  )
    return false;
  if (
    !dense(value.actions) ||
    !dense(value.serverCommands) ||
    !dense(value.events) ||
    !dense(value.snapshots)
  )
    return false;
  if (!value.actions.every(isInputRecord) || !value.serverCommands.every(isInputRecord))
    return false;
  if (
    !value.events.every(isPersistedEventV2) ||
    !value.initialState.events.every(isPersistedEventV2) ||
    !value.finalState.events.every(isPersistedEventV2)
  )
    return false;
  if (!value.snapshots.every((entry) => isReplaySnapshotV2(entry, battleProtocolVersion)))
    return false;
  const first = value.snapshots[0];
  const last = value.snapshots.at(-1);
  return first?.inputSequence === 0 && last?.inputSequence === value.finalState.lastInputSequence;
}

function isBattleStateV2(value: unknown): value is BattleStateV2 {
  if (!isRecord(value)) return false;
  return (
    value.battleProtocolVersion === battleProtocolVersion &&
    typeof value.matchId === 'string' &&
    typeof value.seed === 'string' &&
    Number.isSafeInteger(value.lastInputSequence) &&
    Number.isSafeInteger(value.rngState) &&
    Array.isArray(value.players) &&
    value.players.length === 2 &&
    new Set(value.players.map((player) => (isRecord(player) ? player.id : undefined))).size === 2 &&
    Array.isArray(value.chantQueue) &&
    value.chantQueue.every(
      (entry) =>
        isRecord(entry) &&
        entry.visibility === 'allPlayers' &&
        typeof entry.ownerPlayerId === 'string',
    ) &&
    Array.isArray(value.events) &&
    (value.phase === 'PLAYER_TURN' ||
      value.phase === 'PENDING_CARD_CHOICE' ||
      value.phase === 'MATCH_END') &&
    (value.phase === 'PENDING_CARD_CHOICE') === (value.pendingCardChoice !== undefined)
  );
}

function isReplaySnapshotV2(value: unknown, protocol: number): value is ReplaySnapshotV2 {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.inputSequence) &&
    (value.inputSequence as number) >= 0 &&
    Number.isSafeInteger(value.eventSequence) &&
    (value.eventSequence as number) >= 0 &&
    isRecord(value.state) &&
    value.state.battleProtocolVersion === protocol &&
    !('events' in value.state)
  );
}

function isInputRecord(value: unknown): value is BattleInputRecord<GameActionV2 | ServerCommand> {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.inputSequence) &&
    (value.inputSequence as number) > 0 &&
    isRecord(value.payload) &&
    typeof value.payload.type === 'string'
  );
}

function isPersistedEventV2(value: unknown): value is GameEventV2 {
  if (
    !isRecord(value) ||
    typeof value.type !== 'string' ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1
  )
    return false;
  if (value.type.startsWith('CHANT_')) {
    return value.visibility === 'allPlayers' && typeof value.ownerPlayerId === 'string';
  }
  if (value.type === 'CARD_MOVED' || value.type === 'CARD_EXHAUSTED') {
    if (
      typeof value.playerId !== 'string' ||
      value.ownerPlayerId !== value.playerId ||
      typeof value.cardInstanceId !== 'string' ||
      typeof value.definitionId !== 'string' ||
      typeof value.definitionVersion !== 'string' ||
      (value.sourceCardInstanceId !== null && typeof value.sourceCardInstanceId !== 'string') ||
      (value.sourceDefinitionId !== null && typeof value.sourceDefinitionId !== 'string') ||
      (value.sourceDefinitionVersion !== null &&
        typeof value.sourceDefinitionVersion !== 'string') ||
      (value.sourceCardInstanceId === null) !== (value.sourceDefinitionId === null) ||
      (value.sourceCardInstanceId === null) !== (value.sourceDefinitionVersion === null) ||
      !isNonNegativeSafeInteger(value.fromIndex) ||
      !isNonNegativeSafeInteger(value.toIndex) ||
      typeof value.reason !== 'string' ||
      (value.visibility !== 'ownerOnly' && value.visibility !== 'allPlayers')
    )
      return false;
    if (value.type === 'CARD_MOVED') {
      return (
        (value.from === 'hand' || value.from === 'discard' || value.from === 'drawPile') &&
        (value.to === 'hand' || value.to === 'drawPile') &&
        value.fromZone === value.from &&
        value.toZone === value.to &&
        (value.from === 'drawPile' || value.to === 'drawPile'
          ? value.positionVisibility === 'ownerOnly' || value.positionVisibility === 'allPlayers'
          : value.positionVisibility === undefined)
      );
    }
    return (
      (value.from === 'hand' || value.from === 'discard') &&
      typeof value.sourceCardInstanceId === 'string'
    );
  }
  if (value.type === 'DECK_CARD_REVEALED') {
    return (
      typeof value.playerId === 'string' &&
      value.ownerPlayerId === value.playerId &&
      typeof value.cardInstanceId === 'string' &&
      typeof value.definitionId === 'string' &&
      typeof value.definitionVersion === 'string' &&
      value.zone === 'drawPile' &&
      isNonNegativeSafeInteger(value.index) &&
      value.position === value.index &&
      (value.positionVisibility === 'ownerOnly' || value.positionVisibility === 'allPlayers') &&
      typeof value.sourceCardInstanceId === 'string' &&
      typeof value.sourceDefinitionId === 'string' &&
      typeof value.sourceDefinitionVersion === 'string' &&
      typeof value.reason === 'string' &&
      (value.visibility === 'ownerOnly' || value.visibility === 'allPlayers')
    );
  }
  if (value.type === 'DECK_SHUFFLED') {
    return (
      typeof value.playerId === 'string' &&
      value.ownerPlayerId === value.playerId &&
      value.pile === 'drawPile' &&
      (value.reason === 'DRAW_PILE_EMPTY' || value.reason === 'ALCHEMY_TRANSFORM') &&
      Array.isArray(value.cardInstanceIds) &&
      dense(value.cardInstanceIds) &&
      value.cardInstanceIds.every((id) => typeof id === 'string') &&
      Array.isArray(value.cardInstanceIdsBefore) &&
      dense(value.cardInstanceIdsBefore) &&
      value.cardInstanceIdsBefore.every((id) => typeof id === 'string') &&
      value.cardInstanceIdsBefore.length === value.cardInstanceIds.length &&
      (value.sourceCardInstanceId === null || typeof value.sourceCardInstanceId === 'string') &&
      (value.sourceDefinitionId === null || typeof value.sourceDefinitionId === 'string') &&
      (value.sourceDefinitionVersion === null ||
        typeof value.sourceDefinitionVersion === 'string') &&
      isNonNegativeSafeInteger(value.rngStateBefore) &&
      isNonNegativeSafeInteger(value.rngStateAfter) &&
      value.visibility === 'ownerOnly'
    );
  }
  return true;
}

function validateDefinitionSnapshot(definitions: readonly CardDefinitionV2[]): void {
  if (!Array.isArray(definitions) || !dense(definitions))
    throw new TypeError('Definition snapshot must be a dense array.');
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (
      !isRecord(definition) ||
      typeof definition.id !== 'string' ||
      typeof definition.version !== 'string'
    )
      throw new TypeError('Definition snapshot contains a malformed definition.');
    const key = `${definition.id}\u0000${definition.version}`;
    if (keys.has(key))
      throw new TypeError('Definition snapshot contains a duplicate definition version.');
    keys.add(key);
  }
  canonicalJsonV2(definitions);
}

function validateInitialState(
  state: BattleStateV2,
  definitions: readonly CardDefinitionV2[],
): string | undefined {
  if (
    !isBattleStateV2(state) ||
    typeof state.engineVersion !== 'string' ||
    typeof state.rulesVersion !== 'string' ||
    typeof state.cardDataVersion !== 'string' ||
    !Number.isSafeInteger(state.initialDrawCount) ||
    state.initialDrawCount < 0 ||
    !Number.isSafeInteger(state.turnDrawCount) ||
    state.turnDrawCount < 0 ||
    state.players.some((player) => !isInitialPlayerShape(player))
  ) {
    return 'Replay V2 requires a well-formed protocol 2 initial state.';
  }
  const initialCards = state.players.map((player) => [...player.hand, ...player.drawPile]);
  for (const cards of initialCards) {
    const counts = new Map<string, number>();
    for (const card of cards) {
      const definition = definitions.find(
        (candidate) =>
          candidate.id === card.definitionId && candidate.version === card.definitionVersion,
      );
      if (definition === undefined) {
        return 'Every initial card must resolve to its exact definition snapshot version.';
      }
      const key = `${definition.id}\u0000${definition.version}`;
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (
        definition.deckLimit !== null &&
        definition.deckLimit !== undefined &&
        count > definition.deckLimit
      ) {
        return 'An initial deck exceeds a card definition copy limit.';
      }
    }
  }
  let expected: BattleStateV2;
  try {
    expected = createInitialBattleStateV2({
      matchId: state.matchId,
      engineVersion: state.engineVersion,
      rulesVersion: state.rulesVersion,
      cardDataVersion: state.cardDataVersion,
      seed: state.seed,
      initialDrawCount: state.initialDrawCount,
      turnDrawCount: state.turnDrawCount,
      players: state.players.map((player, index) => ({
        id: player.id,
        drawPile: initialCards[index]!,
      })),
    });
  } catch (error) {
    return errorMessage(error);
  }
  return structurallyEqual(expected, state)
    ? undefined
    : 'Replay V2 initial state must be the canonical engine-created state.';
}

function isInitialPlayerShape(value: unknown): value is BattleStateV2['players'][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    Number.isSafeInteger(value.hp) &&
    Number.isSafeInteger(value.maxHp) &&
    Number.isSafeInteger(value.energy) &&
    Number.isSafeInteger(value.maxEnergy) &&
    Number.isSafeInteger(value.block) &&
    Number.isSafeInteger(value.synthesisCount) &&
    Number.isSafeInteger(value.alchemyStage) &&
    Array.isArray(value.drawPile) &&
    Array.isArray(value.hand) &&
    Array.isArray(value.discard) &&
    Array.isArray(value.exhaust) &&
    Array.isArray(value.statuses) &&
    [...value.drawPile, ...value.hand, ...value.discard, ...value.exhaust].every(
      (card) =>
        isRecord(card) &&
        typeof card.id === 'string' &&
        typeof card.definitionId === 'string' &&
        typeof card.definitionVersion === 'string' &&
        Number.isSafeInteger(card.costModifier) &&
        (card.visibility === 'ownerOnly' || card.visibility === 'allPlayers'),
    )
  );
}

function canonicalJsonV2(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalReplayJson(value: unknown): string {
  return JSON.stringify(canonicalizeReplay(value));
}

function canonicalizeReplay(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Replay JSON rejects non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new TypeError('Replay JSON rejects sparse arrays.');
    return value.map((entry) => {
      if (entry === undefined) throw new TypeError('Replay JSON rejects undefined array entries.');
      return canonicalizeReplay(entry);
    });
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort(compareCodePoints)) {
      if (value[key] !== undefined) result[key] = canonicalizeReplay(value[key]);
    }
    return result;
  }
  throw new TypeError('Replay JSON rejects unsupported values.');
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  return canonicalReplayJson(left) === canonicalReplayJson(right);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers.');
    return value;
  }
  if (Array.isArray(value)) {
    if (!dense(value)) throw new TypeError('Canonical JSON rejects sparse arrays.');
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort(compareCodePoints)) {
      if (value[key] === undefined) {
        throw new TypeError(`Canonical JSON rejects undefined property: ${key}.`);
      }
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError('Canonical JSON rejects unsupported values.');
}

function compareCodePoints(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function dense(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) return false;
  }
  return true;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function mismatch(message: string): ReplayV2VerificationResult {
  return { ok: false, error: { code: 'REPLAY_MISMATCH', message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Definition snapshot validation failed.';
}
