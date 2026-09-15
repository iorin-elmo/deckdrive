import { applyAction } from './index.js';
import type { BattleState, CardDefinitionSource, GameAction, GameEvent } from './index.js';

/** The persisted, JSON-compatible replay format supported by this engine. */
export const replayFormatVersion = 1 as const;

export interface ReplaySnapshot {
  /** Number of player decisions already applied when this snapshot was taken. */
  readonly actionIndex: number;
  /** Last globally ordered event represented by this state, or zero before any events. */
  readonly eventSequence: number;
  /**
   * State at the boundary without its event history. The top-level replay
   * event stream and eventSequence reconstruct the complete BattleState.
   */
  readonly state: Omit<BattleState, 'events'>;
}

export interface Replay {
  readonly formatVersion: typeof replayFormatVersion;
  readonly matchId: string;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly seed: string;
  readonly initialState: BattleState;
  readonly actions: readonly GameAction[];
  readonly events: readonly GameEvent[];
  readonly snapshots: readonly ReplaySnapshot[];
  readonly finalState: BattleState;
  readonly snapshotInterval: number;
  /** Detects accidental or uncoordinated changes to persisted replay content. */
  readonly checksum: string;
}

export interface ReplayRecordingOptions {
  /** Persist a state checkpoint every N successful actions. Defaults to one. */
  readonly snapshotInterval?: number;
}

export type ReplayRecordingResult =
  | { readonly ok: true; readonly replay: Replay }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'ACTION_REJECTED';
        readonly actionIndex: number;
        readonly message: string;
      };
    };

export type ReplayVerificationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'CHECKSUM_MISMATCH' | 'REPLAY_MISMATCH' | 'ACTION_REJECTED';
        readonly message: string;
      };
    };

/**
 * Records only successful, deterministic engine transitions. It performs no
 * filesystem, clock, network, or global-state access.
 */
export function recordReplay(
  initialState: BattleState,
  actions: readonly GameAction[],
  definitions?: CardDefinitionSource,
  options: ReplayRecordingOptions = {},
): ReplayRecordingResult {
  const snapshotInterval = options.snapshotInterval ?? 1;
  if (!isPositiveInteger(snapshotInterval)) {
    throw new RangeError('Replay snapshotInterval must be a positive integer.');
  }

  let state = initialState;
  const snapshots: ReplaySnapshot[] = [snapshot(0, state)];

  for (const [index, action] of actions.entries()) {
    const result = applyAction(state, action, definitions);
    if (!result.ok) {
      return {
        ok: false,
        error: {
          code: 'ACTION_REJECTED',
          actionIndex: index,
          message: result.error.message,
        },
      };
    }

    state = result.state;
    const actionIndex = index + 1;
    if (actionIndex % snapshotInterval === 0 || actionIndex === actions.length) {
      snapshots.push(snapshot(actionIndex, state));
    }
  }

  const content: ReplayContent = {
    formatVersion: replayFormatVersion,
    matchId: initialState.matchId,
    engineVersion: initialState.engineVersion,
    rulesVersion: initialState.rulesVersion,
    cardDataVersion: initialState.cardDataVersion,
    seed: initialState.seed,
    initialState,
    actions: [...actions],
    events: state.events,
    snapshots,
    finalState: state,
    snapshotInterval,
  };
  return { ok: true, replay: { ...content, checksum: calculateReplayChecksum(content) } };
}

/**
 * Replays all recorded decisions and verifies every observable result. A
 * checksum catches changed persisted content before replaying it; the full
 * comparison catches inconsistencies even if a checksum was regenerated.
 */
export function verifyReplay(
  replay: Replay,
  definitions?: CardDefinitionSource,
): ReplayVerificationResult {
  if (!isReplayShape(replay)) {
    return failure('REPLAY_MISMATCH', 'Replay content has an invalid persisted shape.');
  }

  try {
    const { checksum: recordedChecksum, ...content } = replay;
    if (recordedChecksum !== calculateReplayChecksum(content)) {
      return failure('CHECKSUM_MISMATCH', 'Replay content does not match its recorded checksum.');
    }
    if (replay.formatVersion !== replayFormatVersion) {
      return failure('REPLAY_MISMATCH', 'Replay format version is not supported by this engine.');
    }
    if (!isPositiveInteger(replay.snapshotInterval)) {
      return failure('REPLAY_MISMATCH', 'Replay snapshotInterval must be a positive integer.');
    }

    const recorded = recordReplay(replay.initialState, replay.actions, definitions, {
      snapshotInterval: replay.snapshotInterval,
    });
    if (!recorded.ok) {
      return failure(
        'ACTION_REJECTED',
        `Recorded action ${String(recorded.error.actionIndex)} was rejected: ${recorded.error.message}`,
      );
    }
    if (!deepEqual(recorded.replay, replay)) {
      return failure(
        'REPLAY_MISMATCH',
        'Replay events, snapshots, final state, or metadata differ.',
      );
    }
  } catch {
    return failure('REPLAY_MISMATCH', 'Replay content has an invalid persisted shape.');
  }
  return { ok: true };
}

type ReplayContent = Omit<Replay, 'checksum'>;

/**
 * Returns the deterministic checksum stored alongside a replay. It detects
 * corruption, not malicious forgery; authenticity belongs to the persistence
 * boundary that is intentionally outside the engine.
 */
export function calculateReplayChecksum(replay: ReplayContent | Replay): string {
  return checksum({
    formatVersion: replay.formatVersion,
    matchId: replay.matchId,
    engineVersion: replay.engineVersion,
    rulesVersion: replay.rulesVersion,
    cardDataVersion: replay.cardDataVersion,
    seed: replay.seed,
    initialState: replay.initialState,
    actions: replay.actions,
    events: replay.events,
    snapshots: replay.snapshots,
    finalState: replay.finalState,
    snapshotInterval: replay.snapshotInterval,
  });
}

function snapshot(actionIndex: number, state: BattleState): ReplaySnapshot {
  const { events, ...stateWithoutEvents } = state;
  return {
    actionIndex,
    eventSequence: events.at(-1)?.sequence ?? 0,
    state: stateWithoutEvents,
  };
}

/** Reconstructs a complete engine state from an event-free replay snapshot. */
export function restoreReplaySnapshot(
  snapshot: ReplaySnapshot,
  events: readonly GameEvent[],
): BattleState {
  return {
    ...snapshot.state,
    events: events.filter((event) => event.sequence <= snapshot.eventSequence),
  };
}

function failure(
  code: Extract<ReplayVerificationResult, { readonly ok: false }>['error']['code'],
  message: string,
): ReplayVerificationResult {
  return { ok: false, error: { code, message } };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isReplayShape(value: unknown): value is Replay {
  if (!isRecord(value)) return false;
  return (
    typeof value.checksum === 'string' &&
    typeof value.formatVersion === 'number' &&
    typeof value.matchId === 'string' &&
    typeof value.engineVersion === 'string' &&
    typeof value.rulesVersion === 'string' &&
    typeof value.cardDataVersion === 'string' &&
    typeof value.seed === 'string' &&
    isBattleState(value.initialState) &&
    Array.isArray(value.actions) &&
    hasValidArrayEntries(value.actions, isGameAction) &&
    Array.isArray(value.events) &&
    hasValidArrayEntries(value.events, isGameEvent) &&
    Array.isArray(value.snapshots) &&
    hasValidArrayEntries(value.snapshots, isReplaySnapshot) &&
    isBattleState(value.finalState) &&
    typeof value.snapshotInterval === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBattleState(value: unknown): value is BattleState {
  return hasBattleStateFields(value, true);
}

function isSnapshotState(value: unknown): value is Omit<BattleState, 'events'> {
  return hasBattleStateFields(value, false);
}

function hasBattleStateFields(value: unknown, includesEvents: boolean): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === 'string' &&
    typeof value.engineVersion === 'string' &&
    typeof value.rulesVersion === 'string' &&
    typeof value.cardDataVersion === 'string' &&
    typeof value.seed === 'string' &&
    isPositiveInteger(value.turn) &&
    typeof value.activePlayerId === 'string' &&
    (value.phase === 'PLAYER_TURN' || value.phase === 'MATCH_END') &&
    isNonNegativeInteger(value.turnDrawCount) &&
    isNonNegativeInteger(value.initialDrawCount) &&
    Array.isArray(value.players) &&
    value.players.length === 2 &&
    hasValidArrayEntries(value.players, isBattlePlayerState) &&
    hasUniqueBattleStateIds(value.players) &&
    hasActivePlayer(value.activePlayerId, value.players) &&
    hasConsistentBattlePhase(value.phase, value.activePlayerId, value.players) &&
    Array.isArray(value.stack) &&
    hasValidArrayEntries(value.stack, isEffectStackItem) &&
    (includesEvents
      ? Array.isArray(value.events) &&
        hasValidArrayEntries(value.events, isGameEvent) &&
        hasContiguousEventSequences(value.events)
      : !('events' in value))
  );
}

function hasUniqueBattleStateIds(players: readonly unknown[]): boolean {
  const playerIds = players.map((player) => (isRecord(player) ? player.id : undefined));
  const cardIds = players.flatMap((player) => {
    if (!isRecord(player)) return [];
    return ['drawPile', 'hand', 'discard'].flatMap((zone) => {
      const cards = player[zone];
      return Array.isArray(cards)
        ? cards.map((card) => (isRecord(card) ? card.id : undefined))
        : [];
    });
  });
  return hasUniqueStrings(playerIds) && hasUniqueStrings(cardIds);
}

function hasActivePlayer(activePlayerId: unknown, players: readonly unknown[]): boolean {
  return (
    typeof activePlayerId === 'string' &&
    players.some((player) => isRecord(player) && player.id === activePlayerId)
  );
}

function hasConsistentBattlePhase(
  phase: unknown,
  activePlayerId: unknown,
  players: readonly unknown[],
): boolean {
  if (typeof activePlayerId !== 'string') return false;
  const playerHealth = players.map((player) => {
    if (!isRecord(player) || typeof player.id !== 'string' || typeof player.hp !== 'number') {
      return undefined;
    }
    return { id: player.id, hp: player.hp };
  });
  if (playerHealth.some((player) => player === undefined)) return false;

  const livingPlayers = playerHealth.filter(
    (player): player is { readonly id: string; readonly hp: number } =>
      player !== undefined && player.hp > 0,
  );
  if (phase === 'MATCH_END') return livingPlayers.length < 2;
  return (
    phase === 'PLAYER_TURN' &&
    livingPlayers.length === 2 &&
    livingPlayers.some((player) => player.id === activePlayerId)
  );
}

function hasUniqueStrings(values: readonly unknown[]): boolean {
  return (
    hasValidArrayEntries(values, (value) => typeof value === 'string') &&
    new Set(values).size === values.length
  );
}

function hasContiguousEventSequences(events: readonly unknown[]): boolean {
  let expected: number | undefined;
  return hasValidArrayEntries(events, (event) => {
    if (
      !isRecord(event) ||
      !isPositiveInteger(event.sequence) ||
      (expected !== undefined && event.sequence !== expected)
    ) {
      return false;
    }
    expected = event.sequence + 1;
    return true;
  });
}

function isBattlePlayerState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    isNonNegativeNumber(value.hp) &&
    isPositiveInteger(value.maxHp) &&
    value.hp <= value.maxHp &&
    isNonNegativeInteger(value.energy) &&
    isPositiveInteger(value.maxEnergy) &&
    value.energy <= value.maxEnergy &&
    isNonNegativeInteger(value.block) &&
    Array.isArray(value.drawPile) &&
    hasValidArrayEntries(value.drawPile, isCardInstance) &&
    Array.isArray(value.hand) &&
    hasValidArrayEntries(value.hand, isCardInstance) &&
    Array.isArray(value.discard) &&
    hasValidArrayEntries(value.discard, isCardInstance) &&
    Array.isArray(value.statuses) &&
    hasValidArrayEntries(value.statuses, isStatus)
  );
}

function isCardInstance(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.definitionId === 'string';
}

function isStatus(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && isNonNegativeInteger(value.stacks);
}

function isEffectStackItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sourceId === 'string' &&
    typeof value.description === 'string'
  );
}

function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.playerId !== 'string') return false;
  if (value.type === 'END_TURN') return true;
  return (
    value.type === 'PLAY_CARD' &&
    typeof value.cardInstanceId === 'string' &&
    (value.targetId === undefined || typeof value.targetId === 'string')
  );
}

function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value) || !isPositiveInteger(value.sequence)) return false;
  switch (value.type) {
    case 'CARD_PLAYED':
    case 'CARD_DRAWN':
    case 'CARD_DISCARDED':
      return typeof value.playerId === 'string' && typeof value.cardInstanceId === 'string';
    case 'EFFECT_STARTED':
      return typeof value.effectId === 'string';
    case 'DAMAGE_DEALT':
      return (
        typeof value.sourceId === 'string' &&
        typeof value.targetId === 'string' &&
        isNonNegativeNumber(value.amount)
      );
    case 'BLOCK_REDUCED':
    case 'ENTITY_DAMAGED':
    case 'HEALED':
    case 'BLOCK_GAINED':
      return typeof value.targetId === 'string' && isNonNegativeNumber(value.amount);
    case 'CARDS_DRAWN':
      return (
        typeof value.playerId === 'string' &&
        Array.isArray(value.cardInstanceIds) &&
        hasValidArrayEntries(value.cardInstanceIds, (id) => typeof id === 'string')
      );
    case 'STATUS_APPLIED':
      return typeof value.targetId === 'string' && isStatus(value.status);
    case 'STATUS_REMOVED':
      return typeof value.targetId === 'string' && typeof value.statusId === 'string';
    case 'TURN_STARTED':
    case 'TURN_ENDED':
      return typeof value.playerId === 'string';
    case 'MATCH_FINISHED':
      return isTerminalBattleResult(value.result);
    default:
      return false;
  }
}

function isTerminalBattleResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.status === 'DRAW' || (value.status === 'WIN' && typeof value.winnerId === 'string');
}

function isReplaySnapshot(value: unknown): value is ReplaySnapshot {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.actionIndex) &&
    isNonNegativeInteger(value.eventSequence) &&
    isSnapshotState(value.state)
  );
}

/** Array.from materializes holes as undefined, unlike Array.prototype.every. */
function hasValidArrayEntries(
  values: readonly unknown[],
  predicate: (value: unknown) => boolean,
): boolean {
  return Array.from(values).every(predicate);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function checksum(value: unknown): string {
  let hash = 0x811c_9dc5;
  for (const byte of utf8Bytes(canonicalJson(value))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x0100_0193);
  }
  return `fnv1a-32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** FNV-1a is defined over bytes, so encode canonical JSON as UTF-8 explicitly. */
function* utf8Bytes(value: string): Iterable<number> {
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) {
      index += 1;
    } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      // Match standard UTF-8 encoders for a lone surrogate.
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      yield codePoint;
    } else if (codePoint <= 0x7ff) {
      yield 0xc0 | (codePoint >> 6);
      yield 0x80 | (codePoint & 0x3f);
    } else if (codePoint <= 0xffff) {
      yield 0xe0 | (codePoint >> 12);
      yield 0x80 | ((codePoint >> 6) & 0x3f);
      yield 0x80 | (codePoint & 0x3f);
    } else {
      yield 0xf0 | (codePoint >> 18);
      yield 0x80 | ((codePoint >> 12) & 0x3f);
      yield 0x80 | ((codePoint >> 6) & 0x3f);
      yield 0x80 | (codePoint & 0x3f);
    }
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${Array.from(value, (entry) =>
      entry === undefined ? 'null' : canonicalJson(entry),
    ).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Replay content must be JSON-compatible.');
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key]),
    )
  );
}
