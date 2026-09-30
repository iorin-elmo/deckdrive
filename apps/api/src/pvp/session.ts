import { applyAction } from '@deck-drive/game-engine';
import type {
  BattleState,
  CardDefinitionSource,
  GameAction,
  GameEvent,
  PlayerId,
} from '@deck-drive/game-engine';

import {
  parseClientMessage,
  projectBattleState,
  projectEvent,
  type ClientMessage,
  type ErrorMessage,
  type EventMessage,
  type ServerMessage,
  type StateMessage,
} from './protocol.js';

export const pvpTurnTimeoutMs = 60_000;
export const pvpReconnectGraceMs = 60_000;

export interface MatchSnapshot {
  readonly actionIndex: number;
  readonly eventSequence: number;
  readonly state: BattleState;
}

export interface AcceptedAction {
  readonly matchId: string;
  readonly playerId: PlayerId;
  readonly action: GameAction;
  readonly sequence: number;
  readonly events: readonly GameEvent[];
  readonly state: BattleState;
  readonly snapshot: MatchSnapshot | undefined;
}

export interface MatchSessionOptions {
  readonly state: BattleState;
  readonly definitions?: CardDefinitionSource;
  readonly now?: () => number;
  readonly turnTimeoutMs?: number;
  readonly reconnectGraceMs?: number;
  readonly snapshotInterval?: number;
  readonly onAction?: (accepted: AcceptedAction) => Promise<void> | void;
  readonly onAbandoned?: (matchId: string) => Promise<void> | void;
}

export interface ConnectedPlayer {
  readonly playerId: PlayerId;
  readonly send: (message: ServerMessage) => void;
}

interface CachedRequest {
  readonly messages: readonly ServerMessage[];
}

/**
 * Authoritative in-process match coordinator. The queue is the concurrency
 * boundary: every action is validated and committed against the state that
 * immediately precedes it.
 */
export class MatchSession {
  private state: BattleState;
  private readonly definitions: CardDefinitionSource | undefined;
  private readonly now: () => number;
  private readonly turnTimeoutMs: number;
  private readonly reconnectGraceMs: number;
  private readonly snapshotInterval: number;
  private readonly onAction: ((accepted: AcceptedAction) => Promise<void> | void) | undefined;
  private readonly onAbandoned: ((matchId: string) => Promise<void> | void) | undefined;
  private readonly clients = new Map<string, ConnectedPlayer>();
  private readonly requests = new Map<string, CachedRequest>();
  private readonly events: GameEvent[];
  private readonly actions: GameAction[] = [];
  private readonly snapshots: MatchSnapshot[];
  private actionQueue: Promise<void> = Promise.resolve();
  private turnStartedAt: number;
  private disconnectedAt: number | undefined;
  private abandoned = false;

  constructor(options: MatchSessionOptions) {
    if (options.turnTimeoutMs !== undefined && options.turnTimeoutMs <= 0)
      throw new RangeError('turnTimeoutMs must be positive.');
    if (options.reconnectGraceMs !== undefined && options.reconnectGraceMs <= 0)
      throw new RangeError('reconnectGraceMs must be positive.');
    if (options.snapshotInterval !== undefined && options.snapshotInterval <= 0)
      throw new RangeError('snapshotInterval must be positive.');
    this.state = options.state;
    this.definitions = options.definitions;
    this.now = options.now ?? Date.now;
    this.turnTimeoutMs = options.turnTimeoutMs ?? pvpTurnTimeoutMs;
    this.reconnectGraceMs = options.reconnectGraceMs ?? pvpReconnectGraceMs;
    this.snapshotInterval = options.snapshotInterval ?? 1;
    this.onAction = options.onAction;
    this.onAbandoned = options.onAbandoned;
    this.events = [...options.state.events];
    this.snapshots = [
      { actionIndex: 0, eventSequence: lastEventSequence(this.events), state: options.state },
    ];
    this.turnStartedAt = this.now();
  }

  get matchId(): string {
    return this.state.matchId;
  }

  get currentState(): BattleState {
    return this.state;
  }

  get actionSequence(): number {
    return this.actions.length;
  }

  get eventSequence(): number {
    return lastEventSequence(this.events);
  }

  hasCachedRequest(playerId: PlayerId, requestId: string): boolean {
    return this.requests.has(`${playerId}:${requestId}`);
  }

  connect(client: ConnectedPlayer): readonly ServerMessage[] {
    if (!this.isParticipant(client.playerId)) {
      const error = this.error('FORBIDDEN', 'Player is not part of this match.');
      client.send(error);
      return [error];
    }
    if (this.abandoned) {
      const error = this.error('MATCH_ABANDONED', 'This match is no longer reconnectable.');
      client.send(error);
      return [error];
    }
    this.clients.set(client.playerId, client);
    this.disconnectedAt = undefined;
    const state = this.stateMessage(client.playerId, this.latestSnapshot());
    client.send(state);
    const missing = this.events
      .filter((event) => event.sequence > this.latestSnapshot().eventSequence)
      .map((event) => this.eventMessage(client.playerId, event));
    for (const event of missing) client.send(event);
    return [state, ...missing];
  }

  disconnect(playerId: PlayerId, at = this.now()): void {
    this.clients.delete(playerId as string);
    if (this.clients.size === 0) this.disconnectedAt = at;
  }

  /** Called by the server's scheduler; keeping time outside the engine makes it testable. */
  tick(at = this.now()): void {
    if (this.abandoned) return;
    if (this.disconnectedAt !== undefined && at - this.disconnectedAt >= this.reconnectGraceMs) {
      this.abandoned = true;
      void this.onAbandoned?.(this.matchId);
      this.broadcast(this.error('MATCH_ABANDONED', 'Reconnect grace period has expired.'));
      return;
    }
    if (this.state.phase === 'PLAYER_TURN' && at - this.turnStartedAt >= this.turnTimeoutMs) {
      const action: GameAction = { type: 'END_TURN', playerId: this.state.activePlayerId };
      void this.enqueueAction(this.state.activePlayerId, `timeout:${String(this.actionSequence)}`, {
        type: 'ACTION',
        requestId: `timeout:${String(this.actionSequence)}`,
        sequence: this.actionSequence,
        action,
      });
    }
  }

  receive(playerId: PlayerId, value: unknown): Promise<readonly ServerMessage[]> {
    const message = parseClientMessage(value);
    if (message === null)
      return Promise.resolve([this.error('INVALID_MESSAGE', 'Message shape is invalid.')]);
    if (!this.isParticipant(playerId))
      return Promise.resolve([this.error('FORBIDDEN', 'Player is not part of this match.')]);
    if (message.type === 'PING') {
      const pong = {
        type: 'PONG' as const,
        protocolVersion: 1 as const,
        ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
        serverTime: new Date(this.now()).toISOString(),
      };
      return Promise.resolve([pong]);
    }
    if (message.type === 'RESYNC') return Promise.resolve(this.resync(playerId, message));
    if (this.abandoned)
      return Promise.resolve([this.error('MATCH_ABANDONED', 'This match is no longer active.')]);
    return this.enqueueAction(playerId, message.requestId, message);
  }

  private enqueueAction(
    playerId: PlayerId,
    requestId: string,
    message: Extract<ClientMessage, { type: 'ACTION' }>,
  ): Promise<readonly ServerMessage[]> {
    const cached = this.requests.get(`${playerId}:${requestId}`);
    if (cached !== undefined) return Promise.resolve(cached.messages);
    let resolveResult!: (messages: readonly ServerMessage[]) => void;
    const result = new Promise<readonly ServerMessage[]>((resolve) => {
      resolveResult = resolve;
    });
    this.actionQueue = this.actionQueue.then(async () => {
      let messages: readonly ServerMessage[];
      try {
        messages = await this.applyAction(playerId, requestId, message);
      } catch {
        const error = this.error(
          'MATCH_UNAVAILABLE',
          'The match could not be committed. Retry the same request.',
          requestId,
        );
        this.requests.set(`${playerId}:${requestId}`, { messages: [error] });
        messages = [error];
      }
      resolveResult(messages);
    });
    return result;
  }

  private async applyAction(
    playerId: PlayerId,
    requestId: string,
    message: Extract<ClientMessage, { type: 'ACTION' }>,
  ): Promise<readonly ServerMessage[]> {
    if (message.sequence !== this.actions.length) {
      const error = this.error(
        'STALE_ACTION',
        'Action sequence is stale.',
        requestId,
        this.actions.length,
      );
      this.requests.set(`${playerId}:${requestId}`, { messages: [error] });
      return [error];
    }
    if (message.action.playerId !== playerId) {
      const error = this.error(
        'FORBIDDEN',
        'Action player does not match the authenticated player.',
        requestId,
      );
      this.requests.set(`${playerId}:${requestId}`, { messages: [error] });
      return [error];
    }
    const result = applyAction(this.state, message.action, this.definitions);
    if (!result.ok) {
      const error = this.error('INVALID_ACTION', result.error.message, requestId);
      this.requests.set(`${playerId}:${requestId}`, { messages: [error] });
      return [error];
    }
    const previousEventCount = this.events.length;
    const nextState = result.state;
    const nextActionSequence = this.actions.length + 1;
    const nextEvents = [...this.events, ...result.events];
    const snapshot =
      nextActionSequence % this.snapshotInterval === 0 || nextState.phase === 'MATCH_END'
        ? {
            actionIndex: nextActionSequence,
            eventSequence: lastEventSequence(nextEvents),
            state: nextState,
          }
        : undefined;
    await this.onAction?.({
      matchId: this.matchId,
      playerId,
      action: message.action,
      sequence: nextActionSequence,
      events: result.events,
      state: nextState,
      snapshot,
    });

    this.state = nextState;
    this.actions.push(message.action);
    this.events.push(...result.events);
    if (snapshot !== undefined) this.snapshots.push(snapshot);
    this.turnStartedAt = this.now();
    const outgoing = nextEvents.slice(previousEventCount);
    const responses: ServerMessage[] = outgoing.map((event) => this.eventMessage(playerId, event));
    const stateMessage = this.stateMessage(playerId, snapshot ?? this.latestSnapshot(), this.state);
    responses.push(stateMessage);
    this.requests.set(`${playerId}:${requestId}`, { messages: responses });
    this.broadcastEvents(outgoing);
    this.broadcastState();
    return responses;
  }

  private resync(
    playerId: PlayerId,
    _message: Extract<ClientMessage, { type: 'RESYNC' }>,
  ): readonly ServerMessage[] {
    const snapshot = this.latestSnapshot();
    const responses: ServerMessage[] = [this.stateMessage(playerId, snapshot)];
    responses.push(
      ...this.events
        .filter((event) => event.sequence > snapshot.eventSequence)
        .map((event) => this.eventMessage(playerId, event)),
    );
    return responses;
  }

  private latestSnapshot(): MatchSnapshot {
    return this.snapshots.at(-1)!;
  }

  private stateMessage(
    playerId: PlayerId,
    snapshot: MatchSnapshot,
    sourceState: BattleState = snapshot.state,
  ): StateMessage {
    return {
      type: 'STATE',
      protocolVersion: 1,
      matchId: this.state.matchId,
      // These are the current stream cursors even when `state` is an older
      // snapshot. The following EVENT messages advance the snapshot to them.
      actionSequence: this.actions.length,
      eventSequence: this.eventSequence,
      snapshotActionIndex: snapshot.actionIndex,
      state: projectBattleState(sourceState, playerId),
    };
  }

  private eventMessage(playerId: PlayerId, event: GameEvent): EventMessage {
    return {
      type: 'EVENT',
      protocolVersion: 1,
      matchId: this.state.matchId,
      sequence: event.sequence,
      event: projectEvent(event, playerId),
    };
  }

  private broadcastEvents(events: readonly GameEvent[]): void {
    for (const client of this.clients.values()) {
      for (const event of events)
        client.send(this.eventMessage(client.playerId as PlayerId, event));
    }
  }

  private broadcastState(): void {
    const snapshot = this.latestSnapshot();
    for (const client of this.clients.values())
      client.send(this.stateMessage(client.playerId as PlayerId, snapshot, this.state));
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.values()) client.send(message);
  }

  private error(
    code: ErrorMessage['code'],
    message: string,
    requestId?: string,
    expectedSequence?: number,
  ): ErrorMessage {
    return {
      type: 'ERROR',
      protocolVersion: 1,
      code,
      message,
      ...(requestId === undefined ? {} : { requestId }),
      ...(expectedSequence === undefined ? {} : { expectedSequence }),
    };
  }

  private isParticipant(playerId: PlayerId): boolean {
    return this.state.players.some((player) => player.id === playerId);
  }
}

function lastEventSequence(events: readonly GameEvent[]): number {
  return events.at(-1)?.sequence ?? 0;
}
