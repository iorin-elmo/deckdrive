import {
  applyBattleInputV2,
  battleProtocolVersion,
  createInitialBattleStateV2,
  isValidCardDefinitionV2,
  normalSynthesisOutputDefinitionsV2,
  isGameActionV2,
  projectBattleStateV2,
  projectGameEventV2,
} from './protocol-v2.js';
import type { PlayerId } from './index.js';
import type {
  BattleInput,
  BattleStateV2,
  CardDefinitionV2,
  GameActionV2,
  GameEventV2,
  GameEventV2Type,
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

export const playerReplayProjectionVersionV2 = 1 as const;

export interface PlayerReplayViewV2 {
  readonly formatVersion: 2;
  readonly battleProtocolVersion: 2;
  readonly projectionVersion: typeof playerReplayProjectionVersionV2;
  readonly viewerPlayerId: PlayerId;
  readonly draftDefinitionRevision: string;
  readonly matchId: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly initialState: Record<string, unknown>;
  readonly actions: readonly BattleInputRecord<Record<string, unknown>>[];
  readonly events: readonly Record<string, unknown>[];
  readonly snapshots: readonly {
    inputSequence: number;
    eventSequence: number;
    state: Record<string, unknown>;
  }[];
  readonly finalState: Record<string, unknown>;
  readonly snapshotInterval: number;
  readonly projectionChecksum: string;
}

/** Project only a replay that has passed authoritative checksum and simulation verification. */
export function projectReplayV2(
  replay: ReplayV2,
  definitionSnapshots: DefinitionSnapshotRegistry,
  authorizeServerCommand: ServerCommandAuthorizer,
  viewerPlayerId: PlayerId,
): PlayerReplayViewV2 {
  const verified = verifyReplayV2(replay, definitionSnapshots, authorizeServerCommand);
  if (!verified.ok) throw new Error(verified.error.message);
  if (!replay.initialState.players.some((player) => player.id === viewerPlayerId))
    throw new Error('Replay viewer must be a participant.');
  const projectState = (state: BattleStateV2): Record<string, unknown> =>
    JSON.parse(JSON.stringify(projectBattleStateV2(state, viewerPlayerId))) as Record<
      string,
      unknown
    >;
  const content = {
    formatVersion: replay.formatVersion,
    battleProtocolVersion: replay.battleProtocolVersion,
    projectionVersion: playerReplayProjectionVersionV2,
    viewerPlayerId,
    draftDefinitionRevision: replay.draftDefinitionRevision,
    matchId: replay.matchId,
    engineVersion: replay.engineVersion,
    rulesVersion: replay.rulesVersion,
    cardDataVersion: replay.cardDataVersion,
    initialState: projectState(replay.initialState),
    actions: replay.actions.map(({ inputSequence, payload }) => ({
      inputSequence,
      payload:
        payload.playerId === viewerPlayerId
          ? (structuredClone(payload) as unknown as Record<string, unknown>)
          : payload.type === 'PLAY_CARD'
            ? {
                type: payload.type,
                playerId: payload.playerId,
                cardInstanceId: payload.cardInstanceId,
                ...(payload.targetId === undefined ? {} : { targetId: payload.targetId }),
              }
            : payload.type === 'SUBMIT_CARD_CHOICE'
              ? { type: payload.type, playerId: payload.playerId, redacted: true }
              : { type: payload.type, playerId: payload.playerId },
    })),
    events: replay.events.map((event) => projectGameEventV2(event, viewerPlayerId)),
    snapshots: replay.snapshots.map((snapshot) => {
      const state = projectState({ ...snapshot.state, events: [] });
      delete state.events;
      return {
        inputSequence: snapshot.inputSequence,
        eventSequence: snapshot.eventSequence,
        state,
      };
    }),
    finalState: projectState(replay.finalState),
    snapshotInterval: replay.snapshotInterval,
  };
  return { ...content, projectionChecksum: calculatePlayerReplayProjectionChecksumV2(content) };
}

export function calculatePlayerReplayProjectionChecksumV2(
  view: Omit<PlayerReplayViewV2, 'projectionChecksum'> | PlayerReplayViewV2,
): string {
  const content = { ...view } as Record<string, unknown>;
  delete content.projectionChecksum;
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonicalReplayJson(content)))
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `fnv1a-32:${hash.toString(16).padStart(8, '0')}`;
}

export function verifyPlayerReplayViewV2(view: PlayerReplayViewV2):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'INVALID_PROJECTION' | 'CHECKSUM_MISMATCH';
        readonly message: string;
      };
    } {
  const invalid = (message: string) => ({
    ok: false as const,
    error: { code: 'INVALID_PROJECTION' as const, message },
  });
  if (
    !isRecord(view) ||
    !onlyKeys(view, [
      'formatVersion',
      'battleProtocolVersion',
      'projectionVersion',
      'viewerPlayerId',
      'draftDefinitionRevision',
      'matchId',
      'engineVersion',
      'rulesVersion',
      'cardDataVersion',
      'initialState',
      'actions',
      'events',
      'snapshots',
      'finalState',
      'snapshotInterval',
      'projectionChecksum',
    ]) ||
    view.formatVersion !== 2 ||
    view.battleProtocolVersion !== 2 ||
    view.projectionVersion !== playerReplayProjectionVersionV2 ||
    typeof view.viewerPlayerId !== 'string' ||
    typeof view.matchId !== 'string' ||
    typeof view.draftDefinitionRevision !== 'string' ||
    typeof view.engineVersion !== 'string' ||
    typeof view.rulesVersion !== 'string' ||
    typeof view.cardDataVersion !== 'string' ||
    !isNonNegativeSafeInteger(view.snapshotInterval) ||
    view.snapshotInterval === 0 ||
    typeof view.projectionChecksum !== 'string' ||
    !Array.isArray(view.actions) ||
    !Array.isArray(view.events) ||
    !Array.isArray(view.snapshots) ||
    !isRecord(view.initialState) ||
    !isRecord(view.finalState)
  )
    return invalid('Malformed player replay view.');
  let checksum: string;
  try {
    checksum = calculatePlayerReplayProjectionChecksumV2(view);
  } catch {
    return invalid('Unsupported player replay JSON.');
  }
  if (checksum !== view.projectionChecksum)
    return {
      ok: false,
      error: { code: 'CHECKSUM_MISMATCH', message: 'Player replay checksum mismatch.' },
    };
  if (hasSecretReplayField(view))
    return invalid('Player replay contains authoritative private data.');
  if (
    !validProjectedState(view.initialState, view.viewerPlayerId, true) ||
    !validProjectedState(view.finalState, view.viewerPlayerId, true) ||
    view.initialState.matchId !== view.matchId ||
    view.finalState.matchId !== view.matchId ||
    ![view.initialState, view.finalState].every(
      (state) =>
        state.engineVersion === view.engineVersion &&
        state.rulesVersion === view.rulesVersion &&
        state.cardDataVersion === view.cardDataVersion,
    ) ||
    view.initialState.lastInputSequence !== 0
  )
    return invalid('Invalid projected battle state.');
  if (
    !dense(view.events) ||
    !view.events.every(
      (event, index) =>
        isRecord(event) &&
        event.sequence === index + 1 &&
        validProjectedEvent(event, view.viewerPlayerId),
    )
  )
    return invalid('Invalid projected event sequence or event visibility.');
  if (canonicalReplayJson(view.finalState.events) !== canonicalReplayJson(view.events))
    return invalid('Final projected events do not match the replay events.');
  const initialEvents = view.initialState.events as unknown[];
  if (
    canonicalReplayJson(initialEvents) !==
    canonicalReplayJson(view.events.slice(0, initialEvents.length))
  )
    return invalid('Initial projected events do not match the replay event prefix.');
  if (
    !dense(view.actions) ||
    !view.actions.every(
      (action, index) =>
        isRecord(action) &&
        onlyKeys(action, ['inputSequence', 'payload']) &&
        isNonNegativeSafeInteger(action.inputSequence) &&
        action.inputSequence > 0 &&
        action.inputSequence <= (view.finalState.lastInputSequence as number) &&
        (index === 0 || action.inputSequence > view.actions[index - 1]!.inputSequence) &&
        isRecord(action.payload) &&
        validProjectedAction(action.payload, view.viewerPlayerId),
    )
  )
    return invalid('Invalid projected action.');
  if (
    !dense(view.snapshots) ||
    !view.snapshots.every(
      (snapshot) =>
        isRecord(snapshot) &&
        onlyKeys(snapshot, ['inputSequence', 'eventSequence', 'state']) &&
        isNonNegativeSafeInteger(snapshot.inputSequence) &&
        isNonNegativeSafeInteger(snapshot.eventSequence) &&
        (snapshot.eventSequence as number) <= view.events.length &&
        validProjectedState(snapshot.state, view.viewerPlayerId, false) &&
        snapshot.state.matchId === view.matchId &&
        snapshot.state.engineVersion === view.engineVersion &&
        snapshot.state.rulesVersion === view.rulesVersion &&
        snapshot.state.cardDataVersion === view.cardDataVersion &&
        snapshot.state.lastInputSequence === snapshot.inputSequence,
    )
  )
    return invalid('Invalid projected snapshot.');
  if (
    view.snapshots[0]?.inputSequence !== 0 ||
    view.snapshots[0]?.eventSequence !== (view.initialState.events as unknown[]).length ||
    view.snapshots.at(-1)?.inputSequence !== view.finalState.lastInputSequence ||
    view.snapshots.at(-1)?.eventSequence !== view.events.length ||
    view.snapshots.some(
      (snapshot, index) =>
        index > 0 &&
        (snapshot.inputSequence <= view.snapshots[index - 1]!.inputSequence ||
          snapshot.eventSequence < view.snapshots[index - 1]!.eventSequence),
    )
  )
    return invalid('Invalid snapshot sequence.');
  return { ok: true };
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasSecretReplayField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecretReplayField);
  if (!isRecord(value)) return false;
  const forbidden = new Set([
    'seed',
    'rngState',
    'rngStateBefore',
    'rngStateAfter',
    'serverCommands',
    'timeoutAuthorization',
    'timeoutAttestation',
    'deadlineAt',
    'issuedAt',
    'timeoutAt',
    'deadlineCommitment',
  ]);
  return Object.entries(value).some(
    ([key, child]) => forbidden.has(key) || hasSecretReplayField(child),
  );
}

function validProjectedState(
  value: unknown,
  viewerId: PlayerId,
  withEvents: boolean,
): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !onlyKeys(value, [
      'matchId',
      'engineVersion',
      'rulesVersion',
      'cardDataVersion',
      'battleProtocolVersion',
      'turn',
      'activePlayerId',
      'phase',
      'turnDrawCount',
      'initialDrawCount',
      'players',
      'chantQueue',
      'chantEntrySequence',
      'generatedCardSequence',
      'nextChoiceRequestSequence',
      'pendingEffectSequence',
      'pendingCardChoice',
      'terminalResult',
      'lastInputSequence',
      'events',
    ]) ||
    typeof value.matchId !== 'string' ||
    typeof value.engineVersion !== 'string' ||
    typeof value.rulesVersion !== 'string' ||
    typeof value.cardDataVersion !== 'string' ||
    value.battleProtocolVersion !== battleProtocolVersion ||
    !isNonNegativeSafeInteger(value.turn) ||
    value.turn === 0 ||
    typeof value.activePlayerId !== 'string' ||
    !['PLAYER_TURN', 'PENDING_CARD_CHOICE', 'MATCH_END'].includes(String(value.phase)) ||
    ![
      'turnDrawCount',
      'initialDrawCount',
      'chantEntrySequence',
      'generatedCardSequence',
      'nextChoiceRequestSequence',
      'pendingEffectSequence',
      'lastInputSequence',
    ].every((key) => isNonNegativeSafeInteger(value[key])) ||
    value.nextChoiceRequestSequence === 0 ||
    !Array.isArray(value.chantQueue) ||
    !dense(value.chantQueue) ||
    !value.chantQueue.every(validProjectedChant) ||
    !Array.isArray(value.players) ||
    value.players.length !== 2 ||
    !dense(value.players) ||
    new Set(value.players.map((player) => (isRecord(player) ? player.id : undefined))).size !== 2 ||
    !value.players.some((player) => isRecord(player) && player.id === viewerId) ||
    !value.players.some((player) => isRecord(player) && player.id === value.activePlayerId) ||
    (value.phase === 'PENDING_CARD_CHOICE') !== (value.pendingCardChoice !== undefined) ||
    (value.phase === 'MATCH_END') !== (value.terminalResult !== undefined) ||
    !validProjectedTerminal(value.terminalResult) ||
    (withEvents
      ? !Array.isArray(value.events) ||
        !dense(value.events) ||
        !value.events.every(
          (event: unknown) => isRecord(event) && validProjectedEvent(event, viewerId),
        )
      : 'events' in value)
  )
    return false;
  for (const player of value.players) {
    if (
      !isRecord(player) ||
      !onlyKeys(player, [
        'id',
        'hp',
        'maxHp',
        'energy',
        'maxEnergy',
        'block',
        'drawPile',
        'hand',
        'discard',
        'exhaust',
        'statuses',
        'pendingEffects',
        'synthesisCount',
        'alchemyStage',
      ]) ||
      typeof player.id !== 'string' ||
      player.id.length === 0 ||
      !['hp', 'maxHp', 'energy', 'maxEnergy', 'block', 'synthesisCount'].every((key) =>
        isNonNegativeSafeInteger(player[key]),
      ) ||
      ![0, 1, 2, 3].includes(player.alchemyStage as number) ||
      !Array.isArray(player.statuses) ||
      !dense(player.statuses) ||
      !player.statuses.every(
        (status) =>
          isRecord(status) &&
          onlyKeys(status, ['id', 'stacks']) &&
          typeof status.id === 'string' &&
          isNonNegativeSafeInteger(status.stacks),
      ) ||
      !Array.isArray(player.pendingEffects) ||
      !dense(player.pendingEffects) ||
      !player.pendingEffects.every(
        (effect) =>
          isRecord(effect) &&
          onlyKeys(effect, [
            'pendingEffectId',
            'ownerPlayerId',
            'targetPlayerId',
            'sourceCardInstanceId',
            'sourceDefinitionId',
            'sourceDefinitionVersion',
            'effectType',
            'trigger',
            'expiresOn',
            'createdSequence',
            'amount',
            'remainingTriggers',
            'visibility',
          ]) &&
          [
            'pendingEffectId',
            'ownerPlayerId',
            'targetPlayerId',
            'sourceCardInstanceId',
            'sourceDefinitionId',
            'sourceDefinitionVersion',
          ].every((key) => typeof effect[key] === 'string') &&
          effect.effectType === 'MAGE_GRIMOIRE_SEAL' &&
          effect.trigger === 'NEXT_DAMAGE_HIT' &&
          effect.expiresOn === 'MATCH_END' &&
          isNonNegativeSafeInteger(effect.createdSequence) &&
          effect.amount === 5 &&
          effect.remainingTriggers === 1 &&
          effect.visibility === 'allPlayers',
      )
    )
      return false;
    for (const zone of ['drawPile', 'hand', 'discard', 'exhaust']) {
      const cards = player[zone];
      if (!Array.isArray(cards) || !dense(cards)) return false;
      if (
        cards.some(
          (card) =>
            !isRecord(card) ||
            !['ownerOnly', 'allPlayers'].includes(String(card.visibility)) ||
            (player.id !== viewerId && (zone === 'drawPile' || card.visibility === 'ownerOnly')
              ? !onlyKeys(card, ['visibility']) || card.visibility !== 'ownerOnly'
              : !validProjectedCard(card)),
        )
      )
        return false;
    }
  }
  const pending = value.pendingCardChoice;
  if (pending !== undefined && !validProjectedPending(pending, viewerId)) return false;
  return true;
}

function validProjectedCard(card: Record<string, unknown>): boolean {
  return (
    onlyKeys(card, ['id', 'definitionId', 'definitionVersion', 'costModifier', 'visibility']) &&
    typeof card.id === 'string' &&
    card.id.length > 0 &&
    typeof card.definitionId === 'string' &&
    card.definitionId.length > 0 &&
    typeof card.definitionVersion === 'string' &&
    card.definitionVersion.length > 0 &&
    Number.isSafeInteger(card.costModifier)
  );
}

function validProjectedPending(value: unknown, viewerId: PlayerId): boolean {
  if (
    !isRecord(value) ||
    typeof value.ownerPlayerId !== 'string' ||
    !['CARD', 'CARDS', 'RECIPE'].includes(String(value.choiceKind))
  )
    return false;
  if (value.ownerPlayerId !== viewerId) return onlyKeys(value, ['ownerPlayerId', 'choiceKind']);
  return (
    onlyKeys(value, [
      'choiceRequestId',
      'ownerPlayerId',
      'sourceInputSequence',
      'sourceCardInstanceId',
      'sourceDefinitionId',
      'sourceDefinitionVersion',
      'choiceKind',
      'candidateIds',
      'minSelections',
      'maxSelections',
      'resolution',
      'deadlineCommandSequence',
      'continuation',
    ]) &&
    typeof value.choiceRequestId === 'string' &&
    value.choiceRequestId.length > 0 &&
    typeof value.sourceCardInstanceId === 'string' &&
    typeof value.sourceDefinitionId === 'string' &&
    typeof value.sourceDefinitionVersion === 'string' &&
    isNonNegativeSafeInteger(value.sourceInputSequence) &&
    Array.isArray(value.candidateIds) &&
    dense(value.candidateIds) &&
    value.candidateIds.every((id: unknown) => typeof id === 'string') &&
    isNonNegativeSafeInteger(value.minSelections) &&
    isNonNegativeSafeInteger(value.maxSelections) &&
    (value.maxSelections as number) >= (value.minSelections as number) &&
    isRecord(value.resolution) &&
    onlyKeys(value.resolution, ['type']) &&
    ['MOVE_DRAW_PILE_CARD_TO_HAND', 'MOVE_DRAW_PILE_CARD_TO_HAND_AND_SHUFFLE', 'NONE'].includes(
      String(value.resolution.type),
    ) &&
    (value.deadlineCommandSequence === undefined ||
      isNonNegativeSafeInteger(value.deadlineCommandSequence)) &&
    (value.continuation === undefined || validProjectedContinuation(value.continuation))
  );
}

function validProjectedContinuation(value: unknown): boolean {
  return (
    isRecord(value) &&
    onlyKeys(value, ['sourceCard', 'sourceDefinition', 'action', 'nextEffectIndex']) &&
    isRecord(value.sourceCard) &&
    validProjectedCard(value.sourceCard) &&
    ['ownerOnly', 'allPlayers'].includes(String(value.sourceCard.visibility)) &&
    isValidCardDefinitionV2(value.sourceDefinition) &&
    isGameActionV2(value.action) &&
    value.action.type === 'PLAY_CARD' &&
    isNonNegativeSafeInteger(value.nextEffectIndex)
  );
}

function validProjectedTerminal(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.status === 'DRAW')
    return onlyKeys(value, ['status', 'reason']) && value.reason === 'SIMULTANEOUS_HP_DEPLETION';
  if (value.status !== 'WIN' || typeof value.winnerId !== 'string') return false;
  if (value.reason === 'HP_DEPLETION') return onlyKeys(value, ['status', 'winnerId', 'reason']);
  return (
    value.reason === 'SPECIAL_VICTORY' &&
    onlyKeys(value, ['status', 'winnerId', 'reason', 'specialVictoryId']) &&
    ['MAGE_GRAND_WISH', 'ALCHEMY_SAGE_STONE'].includes(String(value.specialVictoryId))
  );
}

function validProjectedChant(value: unknown): boolean {
  return (
    isRecord(value) &&
    onlyKeys(value, [
      'chantEntryId',
      'ownerPlayerId',
      'visibility',
      'sourceDefinitionId',
      'sourceDefinitionVersion',
      'remaining',
      'completionEffects',
      'damageDelay',
      'sequence',
    ]) &&
    value.visibility === 'allPlayers' &&
    typeof value.chantEntryId === 'string' &&
    typeof value.ownerPlayerId === 'string' &&
    typeof value.sourceDefinitionId === 'string' &&
    typeof value.sourceDefinitionVersion === 'string' &&
    isNonNegativeSafeInteger(value.remaining) &&
    isNonNegativeSafeInteger(value.sequence) &&
    isNonNegativeSafeInteger(value.damageDelay) &&
    Array.isArray(value.completionEffects) &&
    value.completionEffects.length > 0 &&
    dense(value.completionEffects) &&
    value.completionEffects.every(isPersistedChantCompletionEffect)
  );
}

const projectedEventFields: Record<GameEventV2Type, readonly string[]> = {
  CARD_PLAYED: ['playerId', 'cardInstanceId', 'definitionId', 'definitionVersion', 'visibility'],
  EFFECT_STARTED: ['effectId'],
  DAMAGE_DEALT: ['sourceId', 'targetId', 'amount', 'attemptedAmount'],
  BLOCK_REDUCED: ['targetId', 'amount'],
  ENTITY_DAMAGED: ['targetId', 'amount'],
  HEALED: ['targetId', 'amount'],
  BLOCK_GAINED: ['targetId', 'amount'],
  ENERGY_GAINED: ['targetId', 'amount'],
  CARD_DRAWN: ['playerId', 'cardInstanceId', 'visibility'],
  CARD_DISCARDED: ['playerId', 'cardInstanceId', 'definitionId', 'definitionVersion', 'visibility'],
  CARD_EXHAUSTED: [
    'playerId',
    'ownerPlayerId',
    'cardInstanceId',
    'definitionId',
    'definitionVersion',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'from',
    'fromZone',
    'fromIndex',
    'toZone',
    'toIndex',
    'reason',
    'visibility',
  ],
  CARD_CREATED: [
    'playerId',
    'cardInstanceId',
    'definitionId',
    'definitionVersion',
    'sourceCardInstanceId',
    'destination',
    'costModifier',
    'visibility',
  ],
  DECK_CARD_REVEALED: [
    'playerId',
    'ownerPlayerId',
    'cardInstanceId',
    'definitionId',
    'definitionVersion',
    'zone',
    'index',
    'position',
    'positionVisibility',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'reason',
    'visibility',
  ],
  DECK_SHUFFLED: [
    'playerId',
    'ownerPlayerId',
    'pile',
    'reason',
    'cardInstanceIds',
    'cardInstanceIdsBefore',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'visibility',
  ],
  TURN_STARTED: ['playerId'],
  TURN_ENDED: ['playerId'],
  CHANT_STARTED: [
    'chantEntryId',
    'ownerPlayerId',
    'visibility',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'before',
    'after',
    'queueIndex',
  ],
  CHANT_ADVANCED: [
    'chantEntryId',
    'ownerPlayerId',
    'visibility',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'before',
    'after',
    'queueIndex',
  ],
  CHANT_DELAYED: [
    'chantEntryId',
    'ownerPlayerId',
    'visibility',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'before',
    'after',
    'queueIndex',
  ],
  CHANT_COMPLETED: [
    'chantEntryId',
    'ownerPlayerId',
    'visibility',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'before',
    'after',
    'queueIndex',
  ],
  CHANT_CANCELLED: [
    'chantEntryId',
    'ownerPlayerId',
    'visibility',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'before',
    'after',
    'queueIndex',
  ],
  SYNTHESIS_RESOLVED: [
    'playerId',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'materialCardInstanceIds',
    'materialZones',
    'result',
    'recipeId',
    'beforeCount',
    'afterCount',
    'visibility',
  ],
  ALCHEMY_STAGE_CHANGED: ['playerId', 'before', 'after'],
  CARD_CHOICE_REQUESTED: [
    'choiceRequestId',
    'playerId',
    'choiceKind',
    'candidateIds',
    'visibility',
  ],
  CARD_CHOICE_SUBMITTED: ['choiceRequestId', 'playerId', 'selectedIds', 'visibility'],
  CARD_CHOICE_TIMED_OUT: ['choiceRequestId', 'playerId', 'visibility'],
  CARD_MOVED: [
    'playerId',
    'ownerPlayerId',
    'cardInstanceId',
    'definitionId',
    'definitionVersion',
    'from',
    'fromZone',
    'fromIndex',
    'to',
    'toZone',
    'toIndex',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'positionVisibility',
    'reason',
    'visibility',
  ],
  DAMAGE_PREVENTED: ['targetId', 'pendingEffectIds', 'amount'],
  STATUS_APPLIED: ['targetId', 'statusId', 'stacks'],
  STATUS_CONSUMED: ['targetId', 'statusId', 'stacks'],
  PENDING_EFFECT_CREATED: [
    'pendingEffectId',
    'ownerPlayerId',
    'targetPlayerId',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'effectType',
    'trigger',
    'expiresOn',
    'createdSequence',
    'amount',
    'remainingTriggers',
    'visibility',
  ],
  PENDING_EFFECT_CONSUMED: [
    'pendingEffectId',
    'ownerPlayerId',
    'targetPlayerId',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'effectType',
    'trigger',
    'expiresOn',
    'createdSequence',
    'amount',
    'remainingTriggers',
    'visibility',
  ],
  PENDING_EFFECT_EXPIRED: [
    'pendingEffectId',
    'ownerPlayerId',
    'targetPlayerId',
    'sourceCardInstanceId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'effectType',
    'trigger',
    'expiresOn',
    'createdSequence',
    'amount',
    'remainingTriggers',
    'visibility',
  ],
  MATCH_FINISHED: ['result'],
};

function validProjectedEvent(event: Record<string, unknown>, viewerId: PlayerId): boolean {
  if (
    typeof event.type !== 'string' ||
    !Object.hasOwn(projectedEventFields, event.type) ||
    !isNonNegativeSafeInteger(event.sequence) ||
    event.sequence === 0
  )
    return false;
  if (event.redacted === true) {
    const visibility = event.visibility;
    return (
      typeof event.ownerPlayerId === 'string' &&
      event.ownerPlayerId.length > 0 &&
      event.ownerPlayerId !== viewerId &&
      projectedEventFields[event.type as GameEventV2Type].includes('visibility') &&
      !event.type.startsWith('CHANT_') &&
      !event.type.startsWith('PENDING_EFFECT_') &&
      (visibility === 'ownerOnly' ||
        (event.type === 'CARD_MOVED' && visibility === 'allPlayers')) &&
      onlyKeys(event, ['type', 'sequence', 'visibility', 'ownerPlayerId', 'redacted'])
    );
  }
  if ('redacted' in event) return false;
  const fields = projectedEventFields[event.type as GameEventV2Type];
  const owner = event.ownerPlayerId ?? event.playerId;
  const hiddenPosition = owner !== viewerId && event.positionVisibility === 'ownerOnly';
  const positionFields = [
    'zone',
    'from',
    'to',
    'fromZone',
    'toZone',
    'index',
    'position',
    'fromIndex',
    'toIndex',
  ];
  const required = hiddenPosition ? fields.filter((key) => !positionFields.includes(key)) : fields;
  if (
    !onlyKeys(event, ['type', 'sequence', ...required]) ||
    !required.every((key) => key in event && validProjectedEventField(key, event[key]))
  )
    return false;
  if (
    'visibility' in event &&
    event.visibility !== 'ownerOnly' &&
    event.visibility !== 'allPlayers'
  )
    return false;
  if (
    [
      'CARD_PLAYED',
      'CARD_DRAWN',
      'CARD_DISCARDED',
      'CARD_CREATED',
      'CARD_MOVED',
      'CARD_EXHAUSTED',
      'DECK_CARD_REVEALED',
      'DECK_SHUFFLED',
      'CARD_CHOICE_REQUESTED',
      'CARD_CHOICE_SUBMITTED',
      'CARD_CHOICE_TIMED_OUT',
      'SYNTHESIS_RESOLVED',
    ].includes(event.type) &&
    (typeof event.playerId !== 'string' || event.playerId.length === 0)
  )
    return false;
  if (event.type.startsWith('CHANT_') || event.type.startsWith('PENDING_EFFECT_')) {
    if (event.visibility !== 'allPlayers') return false;
  }
  if (event.type === 'DECK_SHUFFLED' || event.type.startsWith('CARD_CHOICE_')) {
    if (event.visibility !== 'ownerOnly') return false;
  }
  if (
    event.type === 'MATCH_FINISHED' &&
    (!isRecord(event.result) || !validProjectedTerminal(event.result))
  )
    return false;
  if (
    event.type === 'SYNTHESIS_RESOLVED' &&
    !['SUCCESS', 'FAILURE', 'SPECIAL'].includes(String(event.result))
  )
    return false;
  if (
    ['CARD_MOVED', 'CARD_EXHAUSTED', 'DECK_CARD_REVEALED', 'DECK_SHUFFLED'].includes(event.type) &&
    event.ownerPlayerId !== event.playerId
  )
    return false;
  if (owner !== viewerId && event.visibility === 'ownerOnly') return false;
  if (owner !== viewerId && event.type === 'CARD_MOVED' && event.toZone === 'drawPile')
    return false;
  return (
    owner === viewerId ||
    event.positionVisibility !== 'ownerOnly' ||
    ['zone', 'from', 'to', 'fromZone', 'toZone', 'index', 'position', 'fromIndex', 'toIndex'].every(
      (key) => !(key in event),
    )
  );
}

function validProjectedEventField(key: string, value: unknown): boolean {
  if (
    [
      'cardInstanceIds',
      'cardInstanceIdsBefore',
      'candidateIds',
      'selectedIds',
      'materialCardInstanceIds',
      'materialZones',
      'pendingEffectIds',
    ].includes(key)
  )
    return Array.isArray(value) && dense(value) && value.every((item) => typeof item === 'string');
  if (
    [
      'amount',
      'attemptedAmount',
      'beforeCount',
      'afterCount',
      'queueIndex',
      'fromIndex',
      'toIndex',
      'index',
      'position',
      'createdSequence',
      'remainingTriggers',
      'stacks',
      'costModifier',
    ].includes(key)
  )
    return Number.isSafeInteger(value);
  if (key === 'before' || key === 'after') return value === null || Number.isSafeInteger(value);
  if (key === 'result')
    return value !== undefined && (typeof value === 'string' || validProjectedTerminal(value));
  if (
    ['sourceCardInstanceId', 'sourceDefinitionId', 'sourceDefinitionVersion', 'recipeId'].includes(
      key,
    )
  )
    return value === null || typeof value === 'string';
  if (key === 'visibility' || key === 'positionVisibility')
    return value === 'ownerOnly' || value === 'allPlayers';
  return typeof value === 'string' && value.length > 0;
}

function validProjectedAction(action: Record<string, unknown>, viewerId: PlayerId): boolean {
  if (typeof action.playerId !== 'string' || action.playerId.length === 0) return false;
  if (action.playerId === viewerId) return isGameActionV2(action);
  if (action.type === 'END_TURN') return onlyKeys(action, ['type', 'playerId']);
  if (action.type === 'PLAY_CARD')
    return (
      onlyKeys(action, ['type', 'playerId', 'cardInstanceId', 'targetId']) &&
      typeof action.cardInstanceId === 'string' &&
      action.cardInstanceId.length > 0 &&
      (action.targetId === undefined || typeof action.targetId === 'string')
    );
  return (
    action.type === 'SUBMIT_CARD_CHOICE' &&
    action.redacted === true &&
    onlyKeys(action, ['type', 'playerId', 'redacted'])
  );
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
  if (!hasRevealBeforeSearchMoves(value.events)) return false;
  if (!value.snapshots.every((entry) => isReplaySnapshotV2(entry, battleProtocolVersion)))
    return false;
  const first = value.snapshots[0];
  const last = value.snapshots.at(-1);
  return first?.inputSequence === 0 && last?.inputSequence === value.finalState.lastInputSequence;
}

function hasRevealBeforeSearchMoves(events: readonly GameEventV2[]): boolean {
  const revealed = new Set<string>();
  for (const event of events) {
    if (event.type === 'DECK_CARD_REVEALED') {
      revealed.add(
        `${String(event.ownerPlayerId)}:${String(event.cardInstanceId)}:${String(event.sourceCardInstanceId)}`,
      );
    } else if (event.type === 'DECK_SHUFFLED') {
      for (const key of revealed) {
        if (key.startsWith(`${String(event.ownerPlayerId)}:`)) revealed.delete(key);
      }
    } else if (event.type === 'CARD_MOVED' && event.reason === 'CARD_CHOICE') {
      const key = `${String(event.ownerPlayerId)}:${String(event.cardInstanceId)}:${String(event.sourceCardInstanceId)}`;
      if (!revealed.delete(key)) return false;
    }
  }
  return true;
}

function isBattleStateV2(value: unknown): value is BattleStateV2 {
  if (!isRecord(value)) return false;
  return (
    value.battleProtocolVersion === battleProtocolVersion &&
    typeof value.matchId === 'string' &&
    typeof value.seed === 'string' &&
    Number.isSafeInteger(value.lastInputSequence) &&
    isNonNegativeSafeInteger(value.pendingEffectSequence) &&
    Number.isSafeInteger(value.rngState) &&
    Array.isArray(value.players) &&
    value.players.length === 2 &&
    new Set(value.players.map((player) => (isRecord(player) ? player.id : undefined))).size === 2 &&
    Array.isArray(value.chantQueue) &&
    value.chantQueue.every(
      (entry) =>
        isRecord(entry) &&
        entry.visibility === 'allPlayers' &&
        typeof entry.ownerPlayerId === 'string' &&
        Array.isArray(entry.completionEffects) &&
        entry.completionEffects.length > 0 &&
        dense(entry.completionEffects) &&
        entry.completionEffects.every(isPersistedChantCompletionEffect),
    ) &&
    Array.isArray(value.events) &&
    (value.phase === 'PLAYER_TURN' ||
      value.phase === 'PENDING_CARD_CHOICE' ||
      value.phase === 'MATCH_END') &&
    (value.phase === 'PENDING_CARD_CHOICE') === (value.pendingCardChoice !== undefined) &&
    (value.pendingCardChoice === undefined ||
      (isRecord(value.pendingCardChoice) &&
        (value.pendingCardChoice.deadlineCommandSequence === undefined
          ? value.pendingCardChoice.deadlineCommitment === undefined
          : Number.isSafeInteger(value.pendingCardChoice.deadlineCommandSequence) &&
            (value.pendingCardChoice.deadlineCommandSequence as number) > 0 &&
            typeof value.pendingCardChoice.deadlineCommitment === 'string' &&
            /^[0-9a-f]{64}$/.test(value.pendingCardChoice.deadlineCommitment))))
  );
}

function isPersistedChantCompletionEffect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === 'DAMAGE') {
    return (
      Number.isSafeInteger(value.amount) &&
      (value.amount as number) > 0 &&
      (value.target === 'SELF' || value.target === 'ENEMY')
    );
  }
  return (
    value.type === 'SPECIAL_VICTORY' &&
    value.specialVictoryId === 'MAGE_GRAND_WISH' &&
    value.requiredAlchemyStage === undefined
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
  if (value.type.startsWith('PENDING_EFFECT_')) {
    return (
      isPendingDefenseEffectV2(value) &&
      (value.type === 'PENDING_EFFECT_CREATED'
        ? value.remainingTriggers === 1
        : value.remainingTriggers === 0)
    );
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
      value.fromZone === value.from &&
      value.toZone === 'exhaust' &&
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
      (value.reason === 'DRAW_PILE_EMPTY_RECYCLE' || value.reason === 'ALCHEMY_TRANSFORM') &&
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
    if (!isValidCardDefinitionV2(definition))
      throw new TypeError('Definition snapshot contains a malformed definition.');
    const key = `${definition.id}\u0000${definition.version}`;
    if (keys.has(key))
      throw new TypeError('Definition snapshot contains a duplicate definition version.');
    keys.add(key);
  }
  if (
    definitions.some((definition) =>
      definition.effects.some(
        (effect: CardDefinitionV2['effects'][number]) =>
          effect.type === 'SYNTHESIZE' && effect.mode === 'NORMAL',
      ),
    )
  ) {
    for (const output of normalSynthesisOutputDefinitionsV2) {
      if (!keys.has(`${output.id}\u0000${output.version}`))
        throw new TypeError(
          `Definition snapshot is missing fixed recipe output ${output.id}@${output.version}.`,
        );
    }
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
    Array.isArray(value.pendingEffects) &&
    value.pendingEffects.every(
      (effect) =>
        isPendingDefenseEffectV2(effect) &&
        effect.ownerPlayerId === value.id &&
        effect.remainingTriggers === 1,
    ) &&
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

function isPendingDefenseEffectV2(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.pendingEffectId === 'string' &&
    typeof value.ownerPlayerId === 'string' &&
    value.targetPlayerId === value.ownerPlayerId &&
    typeof value.sourceCardInstanceId === 'string' &&
    typeof value.sourceDefinitionId === 'string' &&
    typeof value.sourceDefinitionVersion === 'string' &&
    value.effectType === 'MAGE_GRIMOIRE_SEAL' &&
    value.trigger === 'NEXT_DAMAGE_HIT' &&
    value.expiresOn === 'MATCH_END' &&
    isNonNegativeSafeInteger(value.createdSequence) &&
    value.amount === 5 &&
    (value.remainingTriggers === 0 || value.remainingTriggers === 1) &&
    value.visibility === 'allPlayers'
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
