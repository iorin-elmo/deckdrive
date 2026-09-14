import { applyAction } from './index.js';
import type { BattleState, CardDefinitionSource, GameAction, GameEvent } from './index.js';

/** The persisted, JSON-compatible replay format supported by this engine. */
export const replayFormatVersion = 1 as const;

export interface ReplaySnapshot {
  /** Number of player decisions already applied when this snapshot was taken. */
  readonly actionIndex: number;
  /** Last globally ordered event included in state, or zero before any events. */
  readonly eventSequence: number;
  readonly state: BattleState;
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
    return failure('REPLAY_MISMATCH', 'Replay events, snapshots, final state, or metadata differ.');
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
  return {
    actionIndex,
    eventSequence: state.events.at(-1)?.sequence ?? 0,
    state,
  };
}

function failure(
  code: Extract<ReplayVerificationResult, { readonly ok: false }>['error']['code'],
  message: string,
): ReplayVerificationResult {
  return { ok: false, error: { code, message } };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function checksum(value: unknown): string {
  let hash = 0x811c_9dc5;
  for (const character of canonicalJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x0100_0193);
  }
  return `fnv1a-32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
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
