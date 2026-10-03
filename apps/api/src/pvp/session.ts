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
export const pvpTimeoutPenaltyThreshold = 3;
type ActionSource = 'CLIENT' | 'TIMEOUT' | 'FORFEIT';
interface SessionActionMessage {
  readonly type: 'ACTION';
  readonly requestId: string;
  readonly sequence: number;
  readonly action: GameAction;
}

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
  readonly requestId: string;
  readonly responses: readonly ServerMessage[];
  readonly source: ActionSource;
  readonly timeoutStreak: number;
  readonly initialState: BattleState;
  readonly actions: readonly GameAction[];
  readonly definitions: CardDefinitionSource | undefined;
}

export interface MatchSessionOptions {
  readonly state: BattleState;
  readonly initialState?: BattleState;
  readonly definitions?: CardDefinitionSource;
  readonly now?: () => number;
  readonly turnTimeoutMs?: number;
  readonly reconnectGraceMs?: number;
  readonly snapshotInterval?: number;
  readonly ratedAbandonment?: boolean;
  readonly onAction?: (accepted: AcceptedAction) => Promise<void> | void;
  readonly onAbandoned?: (matchId: string) => Promise<void> | void;
  readonly onPlayerConnect?: (playerId: PlayerId) => Promise<void> | void;
  readonly onPlayerDisconnect?: (
    playerId: PlayerId,
    disconnectedAt: number,
  ) => Promise<void> | void;
  readonly history?: {
    readonly actions: readonly GameAction[];
    readonly events: readonly GameEvent[];
    readonly snapshots: readonly MatchSnapshot[];
    readonly turnStartedAt?: number;
    readonly disconnectedAt?: readonly { readonly playerId: PlayerId; readonly at: number }[];
    readonly connectedPlayers?: readonly PlayerId[];
    readonly requests?: readonly RestoredRequest[];
  };
}

export interface ConnectedPlayer {
  readonly playerId: PlayerId;
  readonly send: (message: ServerMessage) => void;
}

interface CachedRequest {
  readonly action: GameAction;
  readonly sequence: number;
  readonly messages?: readonly ServerMessage[];
  readonly pending?: Promise<readonly ServerMessage[]>;
}

export interface RestoredRequest {
  readonly playerId: PlayerId;
  readonly requestId: string;
  readonly source: ActionSource;
  readonly sequence: number;
  readonly action: GameAction;
  readonly messages: readonly ServerMessage[];
  readonly timeoutStreak?: number;
}

/**
 * Authoritative in-process match coordinator. The queue is the concurrency
 * boundary: every action is validated and committed against the state that
 * immediately precedes it.
 */
export class MatchSession {
  private state: BattleState;
  private readonly initialState: BattleState;
  private readonly definitions: CardDefinitionSource | undefined;
  private readonly now: () => number;
  private readonly turnTimeoutMs: number;
  private readonly reconnectGraceMs: number;
  private readonly snapshotInterval: number;
  private readonly ratedAbandonment: boolean;
  private readonly onAction: ((accepted: AcceptedAction) => Promise<void> | void) | undefined;
  private readonly onAbandoned: ((matchId: string) => Promise<void> | void) | undefined;
  private readonly onPlayerConnect: ((playerId: PlayerId) => Promise<void> | void) | undefined;
  private readonly onPlayerDisconnect:
    ((playerId: PlayerId, disconnectedAt: number) => Promise<void> | void) | undefined;
  private readonly clients = new Map<string, Set<ConnectedPlayer>>();
  private readonly requests = new Map<string, CachedRequest>();
  private readonly pendingActions = new Map<string, number>();
  private readonly actionTimestamps = new Map<string, number[]>();
  private readonly events: GameEvent[];
  private readonly actions: GameAction[] = [];
  private readonly snapshots: MatchSnapshot[];
  private actionQueue: Promise<void> = Promise.resolve();
  private turnStartedAt: number;
  private pausedAt: number | undefined;
  private readonly disconnectedAt = new Map<string, number>();
  private readonly connectedOnce = new Set<string>();
  private readonly timeoutStreaks = new Map<string, number>();
  private readonly cardDefinitions = new Map<string, string>();
  private timeoutInFlightTurn: number | undefined;
  private abandoning = false;
  private abandoned = false;
  private abandonRequested = false;
  private timeoutPenaltyPending = false;

  constructor(options: MatchSessionOptions) {
    if (options.turnTimeoutMs !== undefined && options.turnTimeoutMs <= 0)
      throw new RangeError('turnTimeoutMs must be positive.');
    if (options.reconnectGraceMs !== undefined && options.reconnectGraceMs <= 0)
      throw new RangeError('reconnectGraceMs must be positive.');
    if (options.snapshotInterval !== undefined && options.snapshotInterval <= 0)
      throw new RangeError('snapshotInterval must be positive.');
    this.state = options.state;
    this.initialState = options.initialState ?? options.state;
    this.definitions = options.definitions;
    this.now = options.now ?? Date.now;
    this.turnTimeoutMs = options.turnTimeoutMs ?? pvpTurnTimeoutMs;
    this.reconnectGraceMs = options.reconnectGraceMs ?? pvpReconnectGraceMs;
    this.snapshotInterval = options.snapshotInterval ?? 1;
    this.ratedAbandonment = options.ratedAbandonment ?? false;
    this.onAction = options.onAction;
    this.onAbandoned = options.onAbandoned;
    this.onPlayerConnect = options.onPlayerConnect;
    this.onPlayerDisconnect = options.onPlayerDisconnect;
    this.events = [...(options.history?.events ?? options.state.events)];
    this.actions.push(...(options.history?.actions ?? []));
    this.snapshots = options.history?.snapshots?.length
      ? [options.history.snapshots.at(-1)!]
      : [{ actionIndex: 0, eventSequence: lastEventSequence(this.events), state: options.state }];
    this.turnStartedAt = options.history?.turnStartedAt ?? this.now();
    for (const player of options.state.players) this.disconnectedAt.set(player.id, this.now());
    for (const disconnected of options.history?.disconnectedAt ?? [])
      this.disconnectedAt.set(disconnected.playerId, disconnected.at);
    for (const playerId of options.history?.connectedPlayers ?? [])
      this.connectedOnce.add(playerId);
    for (const player of this.initialState.players)
      for (const card of [...player.drawPile, ...player.hand, ...player.discard])
        this.cardDefinitions.set(card.id, card.definitionId);
    for (const request of options.history?.requests ?? []) {
      this.requests.set(requestKey(request.source, request.playerId, request.requestId), {
        action: request.action,
        sequence: request.sequence,
        messages: request.messages,
      });
      if (request.timeoutStreak !== undefined)
        this.timeoutStreaks.set(request.playerId, request.timeoutStreak);
    }
    this.timeoutPenaltyPending = [...this.timeoutStreaks.values()].some(
      (streak) => streak >= pvpTimeoutPenaltyThreshold,
    );
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

  get isActive(): boolean {
    return !this.abandoned && this.state.phase !== 'MATCH_END';
  }

  hasCachedRequest(playerId: PlayerId, requestId: string): boolean {
    return this.requests.has(requestKey('CLIENT', playerId, requestId));
  }

  hasParticipant(playerId: PlayerId): boolean {
    return this.isParticipant(playerId);
  }

  connect(client: ConnectedPlayer): readonly ServerMessage[] {
    if (!this.isParticipant(client.playerId)) {
      const error = this.error('FORBIDDEN', 'Player is not part of this match.');
      client.send(error);
      return [error];
    }
    if (this.abandoned || this.abandonRequested) {
      const error = this.error('MATCH_ABANDONED', 'This match is no longer reconnectable.');
      client.send(error);
      return [error];
    }
    const clients = this.clients.get(client.playerId) ?? new Set<ConnectedPlayer>();
    clients.add(client);
    this.clients.set(client.playerId, clients);
    this.connectedOnce.add(client.playerId);
    this.disconnectedAt.delete(client.playerId);
    void this.onPlayerConnect?.(client.playerId);
    const state = this.stateMessage(client.playerId, this.latestSnapshot(), this.state);
    client.send(state);
    return [state];
  }

  disconnect(clientOrPlayerId: ConnectedPlayer | PlayerId, at = this.now()): void {
    const playerId =
      typeof clientOrPlayerId === 'string' ? clientOrPlayerId : clientOrPlayerId.playerId;
    const clients = this.clients.get(playerId);
    if (clients === undefined) return;
    if (typeof clientOrPlayerId === 'string') clients.clear();
    else {
      if (!clients.delete(clientOrPlayerId)) return;
    }
    if (clients.size === 0) {
      this.clients.delete(playerId);
      this.disconnectedAt.set(playerId, at);
      void this.onPlayerDisconnect?.(playerId, at);
    }
  }

  /** Called by the server's scheduler; keeping time outside the engine makes it testable. */
  tick(at = this.now()): void {
    if (this.pausedAt !== undefined) return;
    if (this.abandoned || this.abandoning || this.abandonRequested) return;
    const expiredDisconnects = [...this.disconnectedAt.entries()].filter(
      ([, disconnectedAt]) => at - disconnectedAt >= this.reconnectGraceMs,
    );
    if (expiredDisconnects.length > 0) {
      const neverConnected = expiredDisconnects.find(([id]) => !this.connectedOnce.has(id));
      const loser =
        this.ratedAbandonment && this.connectedOnce.size === 0
          ? undefined
          : ((neverConnected ??
              expiredDisconnects.sort((left, right) => left[1] - right[1])[0])?.[0] as
              PlayerId | undefined);
      this.scheduleAbandonment(loser, 'DISCONNECT');
      return;
    }
    if (this.timeoutPenaltyPending) {
      const timedOut = [...this.timeoutStreaks.entries()].find(
        ([, streak]) => streak >= pvpTimeoutPenaltyThreshold,
      );
      if (timedOut !== undefined) this.scheduleAbandonment(timedOut[0] as PlayerId, 'TIMEOUT');
      return;
    }
    if (
      this.state.phase === 'PLAYER_TURN' &&
      at - this.turnStartedAt >= this.turnTimeoutMs &&
      this.timeoutInFlightTurn !== this.state.turn
    ) {
      const timeoutTurn = this.state.turn;
      this.timeoutInFlightTurn = timeoutTurn;
      const action: GameAction = { type: 'END_TURN', playerId: this.state.activePlayerId };
      const requestId = `server-timeout:${String(timeoutTurn)}:${String(this.actionSequence)}`;
      void this.enqueueAction(
        this.state.activePlayerId,
        requestId,
        { type: 'ACTION', requestId, sequence: this.actionSequence, action },
        'TIMEOUT',
      ).finally(() => {
        if (this.timeoutInFlightTurn === timeoutTurn) this.timeoutInFlightTurn = undefined;
      });
    }
  }

  /** Maintenance suspends server timeouts without changing the persisted action history. */
  pauseTimeouts(at = this.now()): void {
    this.pausedAt ??= at;
  }

  resumeTimeouts(at = this.now()): void {
    if (this.pausedAt === undefined) return;
    const pausedAt = this.pausedAt;
    this.pausedAt = undefined;
    this.turnStartedAt += Math.max(0, at - pausedAt);
    for (const [playerId, disconnectedAt] of this.disconnectedAt)
      this.disconnectedAt.set(playerId, at - Math.max(0, pausedAt - disconnectedAt));
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
    const cached = this.requests.get(requestKey('CLIENT', playerId, message.requestId));
    if (cached !== undefined && !sameRequest(cached, message))
      return Promise.resolve([
        this.error(
          'REQUEST_CONFLICT',
          'Request ID was already used with different action input.',
          message.requestId,
        ),
      ]);
    if (cached?.messages !== undefined) return Promise.resolve(cached.messages);
    if (cached?.pending !== undefined) return cached.pending;
    if (this.abandoned || this.abandonRequested)
      return Promise.resolve([this.error('MATCH_ABANDONED', 'This match is no longer active.')]);
    if (!this.isActive)
      return Promise.resolve([this.error('MATCH_FINISHED', 'This match has already finished.')]);
    return this.enqueueAction(playerId, message.requestId, message, 'CLIENT');
  }

  forfeit(playerId: PlayerId): Promise<readonly ServerMessage[]> {
    if (!this.ratedAbandonment || !this.isParticipant(playerId))
      return Promise.resolve([this.error('FORBIDDEN', 'Rated forfeit is not available.')]);
    if (!this.isActive)
      return Promise.resolve([this.error('MATCH_FINISHED', 'This match has already finished.')]);
    const requestId = `server-surrender:${playerId}`;
    return this.enqueueAction(
      playerId,
      requestId,
      {
        type: 'ACTION',
        requestId,
        sequence: this.actionSequence,
        action: { type: 'FORFEIT', playerId, reason: 'SURRENDER' },
      },
      'FORFEIT',
    );
  }

  reserveAction(playerId: PlayerId, maximumPending: number, maximumPerSecond: number): boolean {
    const now = this.now();
    const timestamps = (this.actionTimestamps.get(playerId) ?? []).filter(
      (timestamp) => now - timestamp < 1_000,
    );
    if ((this.pendingActions.get(playerId) ?? 0) >= maximumPending) return false;
    if (timestamps.length >= maximumPerSecond) return false;
    timestamps.push(now);
    this.actionTimestamps.set(playerId, timestamps);
    this.pendingActions.set(playerId, (this.pendingActions.get(playerId) ?? 0) + 1);
    return true;
  }

  releaseAction(playerId: PlayerId): void {
    const pending = this.pendingActions.get(playerId) ?? 0;
    if (pending <= 1) this.pendingActions.delete(playerId);
    else this.pendingActions.set(playerId, pending - 1);
  }

  private enqueueAction(
    playerId: PlayerId,
    requestId: string,
    message: SessionActionMessage,
    source: ActionSource,
  ): Promise<readonly ServerMessage[]> {
    const key = requestKey(source, playerId, requestId);
    const cached = this.requests.get(key);
    if (cached !== undefined && !sameRequest(cached, message))
      return Promise.resolve([
        this.error(
          'REQUEST_CONFLICT',
          'Request ID was already used with different action input.',
          requestId,
        ),
      ]);
    if (cached?.messages !== undefined) return Promise.resolve(cached.messages);
    if (cached?.pending !== undefined) return cached.pending;
    let resolveResult!: (messages: readonly ServerMessage[]) => void;
    const result = new Promise<readonly ServerMessage[]>((resolve) => {
      resolveResult = resolve;
    });
    this.requests.set(key, {
      action: message.action,
      sequence: message.sequence,
      pending: result,
    });
    this.actionQueue = this.actionQueue.then(async () => {
      let messages: readonly ServerMessage[];
      try {
        messages = await this.applyAction(playerId, requestId, message, source);
      } catch {
        const error = this.error(
          'MATCH_UNAVAILABLE',
          'The match could not be committed. Retry the same request.',
          requestId,
        );
        this.requests.delete(key);
        messages = [error];
      }
      if (this.requests.get(key)?.pending === result) {
        if (messages[0]?.type === 'ERROR' && messages[0].code === 'MATCH_UNAVAILABLE')
          this.requests.delete(key);
        else
          this.requests.set(key, {
            action: message.action,
            sequence: message.sequence,
            messages,
          });
      }
      resolveResult(messages);
    });
    return result;
  }

  private async applyAction(
    playerId: PlayerId,
    requestId: string,
    message: SessionActionMessage,
    source: ActionSource,
  ): Promise<readonly ServerMessage[]> {
    const key = requestKey(source, playerId, requestId);
    // Server forfeits are queued behind any accepted player action. Their
    // sequence is assigned when persisted, after earlier actions commit.
    if (source !== 'FORFEIT' && message.sequence !== this.actions.length) {
      const error = this.error(
        'STALE_ACTION',
        'Action sequence is stale.',
        requestId,
        this.actions.length,
      );
      this.requests.set(key, {
        action: message.action,
        sequence: message.sequence,
        messages: [error],
      });
      return [error];
    }
    if (message.action.playerId !== playerId) {
      const error = this.error(
        'FORBIDDEN',
        'Action player does not match the authenticated player.',
        requestId,
      );
      this.requests.set(key, {
        action: message.action,
        sequence: message.sequence,
        messages: [error],
      });
      return [error];
    }
    const result = applyAction(this.state, message.action, this.definitions);
    if (!result.ok) {
      const error = this.error('INVALID_ACTION', result.error.message, requestId);
      this.requests.set(key, {
        action: message.action,
        sequence: message.sequence,
        messages: [error],
      });
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
    const timeoutStreak = source === 'TIMEOUT' ? (this.timeoutStreaks.get(playerId) ?? 0) + 1 : 0;
    const outgoing = nextEvents.slice(previousEventCount);
    const responses: ServerMessage[] = outgoing.map((event) => this.eventMessage(playerId, event));
    responses.push(
      this.stateMessage(
        playerId,
        snapshot ?? this.latestSnapshot(),
        nextState,
        nextActionSequence,
        lastEventSequence(nextEvents),
        requestId,
      ),
    );
    await this.onAction?.({
      matchId: this.matchId,
      playerId,
      action: message.action,
      sequence: nextActionSequence,
      events: result.events,
      state: nextState,
      snapshot,
      requestId,
      responses,
      source,
      timeoutStreak,
      initialState: this.initialState,
      actions: [...this.actions, message.action],
      definitions: this.definitions,
    });

    this.state = nextState;
    this.actions.push(message.action);
    this.events.push(...result.events);
    if (snapshot !== undefined) {
      this.snapshots.length = 0;
      this.snapshots.push(snapshot);
    }
    if (source === 'TIMEOUT') this.timeoutStreaks.set(playerId, timeoutStreak);
    else this.timeoutStreaks.set(playerId, 0);
    if (source === 'TIMEOUT' && timeoutStreak >= pvpTimeoutPenaltyThreshold) {
      this.timeoutPenaltyPending = true;
      this.scheduleAbandonment(playerId, 'TIMEOUT');
    }
    if (message.action.type === 'END_TURN') this.turnStartedAt = this.now();
    this.requests.set(key, {
      action: message.action,
      sequence: message.sequence,
      messages: responses,
    });
    this.broadcastEvents(outgoing);
    this.broadcastState(requestId, playerId);
    return responses;
  }

  private resync(
    playerId: PlayerId,
    message: Extract<ClientMessage, { type: 'RESYNC' }>,
  ): readonly ServerMessage[] {
    const snapshot = this.latestSnapshot();
    const responses: ServerMessage[] = [this.stateMessage(playerId, snapshot, this.state)];
    responses.push(
      ...this.events
        .filter((event) => event.sequence > message.afterEventSequence)
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
    actionSequence = this.actions.length,
    eventSequence = this.eventSequence,
    requestId?: string,
  ): StateMessage {
    return {
      type: 'STATE',
      protocolVersion: 1,
      matchId: this.state.matchId,
      actionSequence,
      eventSequence,
      snapshotActionIndex: actionSequence,
      ...(requestId === undefined ? {} : { requestId }),
      state: projectBattleState(sourceState, playerId),
    };
  }

  private eventMessage(playerId: PlayerId, event: GameEvent): EventMessage {
    return {
      type: 'EVENT',
      protocolVersion: 1,
      matchId: this.state.matchId,
      sequence: event.sequence,
      event: projectEvent(
        event,
        playerId,
        event.type === 'CARD_PLAYED' ? this.cardDefinitions.get(event.cardInstanceId) : undefined,
      ),
    };
  }

  private broadcastEvents(events: readonly GameEvent[]): void {
    for (const clients of this.clients.values()) {
      for (const client of clients)
        for (const event of events) client.send(this.eventMessage(client.playerId, event));
    }
  }

  private broadcastState(requestId?: string, requester?: PlayerId): void {
    const snapshot = this.latestSnapshot();
    for (const clients of this.clients.values())
      for (const client of clients)
        client.send(
          this.stateMessage(
            client.playerId,
            snapshot,
            this.state,
            this.actions.length,
            this.eventSequence,
            client.playerId === requester ? requestId : undefined,
          ),
        );
  }

  private broadcast(message: ServerMessage): void {
    for (const clients of this.clients.values()) for (const client of clients) client.send(message);
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

  private scheduleAbandonment(
    playerId: PlayerId | undefined,
    reason: 'DISCONNECT' | 'TIMEOUT',
  ): void {
    if (this.abandonRequested || this.abandoned) return;
    this.abandonRequested = true;
    this.actionQueue = this.actionQueue
      .then(async () => {
        if (this.abandoned) return;
        if (!this.isActive) {
          this.abandonRequested = false;
          this.timeoutPenaltyPending = false;
          return;
        }
        this.abandoning = true;
        if (this.ratedAbandonment && playerId !== undefined) {
          const requestId = `server-forfeit:${reason}:${String(this.actions.length)}`;
          const messages = await this.applyAction(
            playerId,
            requestId,
            {
              type: 'ACTION',
              requestId,
              sequence: this.actions.length,
              action: { type: 'FORFEIT', playerId, reason },
            },
            'FORFEIT',
          );
          if (messages.some((message) => message.type === 'ERROR'))
            throw new Error('Rated forfeit could not be committed.');
          this.abandoning = false;
          this.abandonRequested = false;
          this.timeoutPenaltyPending = false;
          return;
        }
        await this.onAbandoned?.(this.matchId);
        this.abandoning = false;
        this.abandoned = true;
        this.timeoutPenaltyPending = false;
        this.broadcast(this.error('MATCH_ABANDONED', 'Reconnect grace period has expired.'));
      })
      .catch(() => {
        this.abandoning = false;
        this.abandonRequested = false;
      });
  }
}

function lastEventSequence(events: readonly GameEvent[]): number {
  return events.at(-1)?.sequence ?? 0;
}

function requestKey(source: ActionSource, playerId: PlayerId, requestId: string): string {
  return `${source}:${playerId}:${requestId}`;
}

function sameRequest(
  cached: Pick<CachedRequest, 'action' | 'sequence'>,
  message: SessionActionMessage,
): boolean {
  if (cached.sequence !== message.sequence || cached.action.type !== message.action.type)
    return false;
  if (cached.action.playerId !== message.action.playerId) return false;
  if (cached.action.type === 'END_TURN') return true;
  if (cached.action.type === 'FORFEIT')
    return message.action.type === 'FORFEIT' && cached.action.reason === message.action.reason;
  return (
    message.action.type === 'PLAY_CARD' &&
    cached.action.cardInstanceId === message.action.cardInstanceId &&
    cached.action.targetId === message.action.targetId
  );
}
