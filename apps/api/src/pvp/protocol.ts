import type {
  BattleState,
  CardInstance,
  GameAction,
  GameEvent,
  MatchId,
  PlayerId,
} from '@deck-drive/game-engine';

export const pvpProtocolVersion = 1 as const;

export interface PlayerBattleProjection {
  readonly id: PlayerId;
  readonly hp: number;
  readonly maxHp: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly block: number;
  /** Cards are present only for the connected player. */
  readonly hand: readonly CardInstance[];
  /** The contents of every draw pile are hidden, including the viewer's. */
  readonly drawPile: readonly [];
  readonly drawPileCount: number;
  readonly discard: readonly [];
  readonly discardCount: number;
  readonly statuses: BattleState['players'][number]['statuses'];
}

export interface PlayerBattleStateProjection {
  readonly matchId: MatchId;
  readonly engineVersion: string;
  readonly rulesVersion: string;
  readonly cardDataVersion: string;
  readonly turn: number;
  readonly activePlayerId: PlayerId;
  readonly phase: BattleState['phase'];
  readonly turnDrawCount: number;
  readonly initialDrawCount: number;
  readonly players: readonly PlayerBattleProjection[];
  readonly stack: BattleState['stack'];
}

export interface ActionMessage {
  readonly type: 'ACTION';
  readonly requestId: string;
  /** The number of accepted actions known by the client before this action. */
  readonly sequence: number;
  readonly action: GameAction;
}

export interface PingMessage {
  readonly type: 'PING';
  readonly requestId?: string;
}

export interface ResyncMessage {
  readonly type: 'RESYNC';
  readonly afterEventSequence: number;
}

export type ClientMessage = ActionMessage | PingMessage | ResyncMessage;

export interface StateMessage {
  readonly type: 'STATE';
  readonly protocolVersion: typeof pvpProtocolVersion;
  readonly matchId: MatchId;
  readonly actionSequence: number;
  readonly eventSequence: number;
  readonly snapshotActionIndex: number;
  /** Present only on the direct response to the accepted action request. */
  readonly requestId?: string;
  readonly state: PlayerBattleStateProjection;
}

export interface EventMessage {
  readonly type: 'EVENT';
  readonly protocolVersion: typeof pvpProtocolVersion;
  readonly matchId: MatchId;
  readonly sequence: number;
  readonly event: PublicGameEvent;
}

export type PublicGameEvent =
  | (Omit<Extract<GameEvent, { type: 'CARD_PLAYED' }>, 'cardInstanceId'> & {
      readonly cardInstanceId?: string;
    })
  | (Omit<Extract<GameEvent, { type: 'CARD_DRAWN' }>, 'cardInstanceId'> & {
      readonly cardInstanceId?: string;
      readonly count?: number;
    })
  | (Omit<Extract<GameEvent, { type: 'CARDS_DRAWN' }>, 'cardInstanceIds'> & {
      readonly cardInstanceIds?: readonly string[];
      readonly count?: number;
    })
  | (Omit<Extract<GameEvent, { type: 'CARD_DISCARDED' }>, 'cardInstanceId'> & {
      readonly cardInstanceId?: string;
    })
  | GameEvent;

export interface ErrorMessage {
  readonly type: 'ERROR';
  readonly protocolVersion: typeof pvpProtocolVersion;
  readonly code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'INVALID_MESSAGE'
    | 'INVALID_ACTION'
    | 'STALE_ACTION'
    | 'MATCH_NOT_FOUND'
    | 'MATCH_FINISHED'
    | 'MATCH_ABANDONED'
    | 'MATCH_UNAVAILABLE'
    | 'RATE_LIMITED';
  readonly message: string;
  readonly requestId?: string;
  readonly expectedSequence?: number;
}

export interface PongMessage {
  readonly type: 'PONG';
  readonly protocolVersion: typeof pvpProtocolVersion;
  readonly requestId?: string;
  readonly serverTime: string;
}

export type ServerMessage = StateMessage | EventMessage | ErrorMessage | PongMessage;

export function projectBattleState(
  state: BattleState,
  viewerId: PlayerId,
): PlayerBattleStateProjection {
  return {
    matchId: state.matchId,
    engineVersion: state.engineVersion,
    rulesVersion: state.rulesVersion,
    cardDataVersion: state.cardDataVersion,
    turn: state.turn,
    activePlayerId: state.activePlayerId,
    phase: state.phase,
    turnDrawCount: state.turnDrawCount,
    initialDrawCount: state.initialDrawCount,
    players: state.players.map((player) => ({
      id: player.id,
      hp: player.hp,
      maxHp: player.maxHp,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      block: player.block,
      hand: player.id === viewerId ? player.hand : [],
      drawPile: [],
      drawPileCount: player.drawPile.length,
      discard: [],
      discardCount: player.discard.length,
      statuses: player.statuses,
    })),
    stack: state.stack,
  };
}

export function projectEvent(event: GameEvent, viewerId: PlayerId): PublicGameEvent {
  if (event.type === 'EFFECT_STARTED')
    return {
      type: event.type,
      sequence: event.sequence,
      effectId: `effect-${String(event.sequence)}`,
    };
  if (event.type === 'CARD_PLAYED' && event.playerId !== viewerId)
    return { type: event.type, sequence: event.sequence, playerId: event.playerId };
  if (event.type === 'CARD_DRAWN' && event.playerId !== viewerId)
    return { type: event.type, sequence: event.sequence, playerId: event.playerId, count: 1 };
  if (event.type === 'CARDS_DRAWN' && event.playerId !== viewerId)
    return {
      type: event.type,
      sequence: event.sequence,
      playerId: event.playerId,
      count: event.cardInstanceIds.length,
    };
  if (event.type === 'CARD_DISCARDED' && event.playerId !== viewerId)
    return { type: event.type, sequence: event.sequence, playerId: event.playerId };
  return event;
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'PING') {
    return typeof value.requestId === 'undefined' || isNonEmptyString(value.requestId)
      ? {
          type: 'PING',
          ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
        }
      : null;
  }
  if (value.type === 'RESYNC') {
    return isNonNegativeInteger(value.afterEventSequence)
      ? { type: 'RESYNC', afterEventSequence: value.afterEventSequence }
      : null;
  }
  if (value.type !== 'ACTION') return null;
  if (!isNonEmptyString(value.requestId) || !isNonNegativeInteger(value.sequence)) return null;
  if (!isGameAction(value.action)) return null;
  return {
    type: 'ACTION',
    requestId: value.requestId,
    sequence: value.sequence,
    action: value.action,
  };
}

function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.playerId !== 'string') return false;
  if (value.type === 'END_TURN') return true;
  return (
    value.type === 'PLAY_CARD' &&
    typeof value.cardInstanceId === 'string' &&
    (typeof value.targetId === 'undefined' || typeof value.targetId === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
