export type PvpAction =
  | { readonly type: 'END_TURN'; readonly playerId: string }
  | {
      readonly type: 'PLAY_CARD';
      readonly playerId: string;
      readonly cardInstanceId: string;
      readonly targetId?: string;
    };

export type PvpServerMessage =
  | {
      readonly type: 'STATE';
      readonly protocolVersion: 1;
      readonly matchId: string;
      readonly actionSequence: number;
      readonly eventSequence: number;
      readonly snapshotActionIndex: number;
      readonly requestId?: string;
      readonly state: Record<string, unknown>;
      readonly [key: string]: unknown;
    }
  | {
      readonly type: 'EVENT';
      readonly protocolVersion: 1;
      readonly matchId: string;
      readonly sequence: number;
      readonly event: Record<string, unknown>;
      readonly [key: string]: unknown;
    }
  | {
      readonly type: 'ERROR';
      readonly protocolVersion: 1;
      readonly code: string;
      readonly message: string;
      readonly requestId?: string;
      readonly [key: string]: unknown;
    }
  | {
      readonly type: 'PONG';
      readonly protocolVersion: 1;
      readonly serverTime: string;
      readonly requestId?: string;
      readonly [key: string]: unknown;
    };

export interface PvpSocketLike {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PvpSocketHandlers {
  readonly onMessage: (message: PvpServerMessage) => void;
  readonly onActionAcknowledged?: (requestId: string) => void;
  readonly onMalformedMessage?: () => void;
  readonly onStatus?: (status: 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED') => void;
}

export interface PvpSocketClientOptions {
  readonly baseUrl?: string;
  readonly socketFactory?: (url: string) => PvpSocketLike;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
}

/** Browser transport only: it sends intent and renders server messages. */
export class PvpSocketClient {
  private currentSocket: PvpSocketLike;
  private nextRequest = 0;
  private readonly clientId = randomClientId();
  private readonly socketFactory: (url: string) => PvpSocketLike;
  private readonly url: string;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly handlers: PvpSocketHandlers;
  private readonly outbound: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closed = false;
  private lastEventSequence = 0;
  private lastActionSequence = 0;
  private readonly pendingActions = new Map<string, { payload: string; sequence: number }>();

  constructor(matchId: string, handlers: PvpSocketHandlers, options: PvpSocketClientOptions = {}) {
    this.socketFactory =
      options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as PvpSocketLike);
    this.url = webSocketUrl(options.baseUrl, matchId);
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 12;
    this.handlers = handlers;
    this.currentSocket = this.socketFactory(this.url);
    this.bindSocket(this.currentSocket, false);
  }

  get socket(): PvpSocketLike {
    return this.currentSocket;
  }

  private bindSocket(socket: PvpSocketLike, reconnecting: boolean): void {
    this.handlers.onStatus?.(reconnecting ? 'RECONNECTING' : 'CONNECTING');
    socket.onopen = () => {
      if (socket !== this.currentSocket) return;
      this.handlers.onStatus?.('OPEN');
      this.sendRaw({ type: 'RESYNC', afterEventSequence: this.lastEventSequence });
      const queued = this.outbound.splice(0);
      for (const payload of queued) this.sendRaw(payload);
      for (const pending of this.pendingActions.values()) {
        if (!queued.includes(pending.payload)) this.sendRaw(pending.payload);
      }
    };
    socket.onmessage = (event) => {
      if (socket !== this.currentSocket) return;
      const message = parseServerMessage(event.data);
      if (message === null) {
        this.handlers.onMalformedMessage?.();
        return;
      }
      if (message.type === 'STATE') {
        if (typeof message.requestId === 'string') {
          this.pendingActions.delete(message.requestId);
          this.handlers.onActionAcknowledged?.(message.requestId);
        }
        if (
          typeof message.actionSequence === 'number' &&
          message.actionSequence < this.lastActionSequence
        )
          return;
        if (typeof message.actionSequence === 'number')
          this.lastActionSequence = Math.max(this.lastActionSequence, message.actionSequence);
        // A successful handshake alone does not prove that the match can be
        // resumed. Only a usable state resets the reconnect attempt budget.
        this.reconnectAttempt = 0;
      }
      if (message.type === 'ERROR' && typeof message.requestId === 'string') {
        if (message.code !== 'MATCH_UNAVAILABLE' && message.code !== 'MAINTENANCE_MODE')
          this.pendingActions.delete(message.requestId);
      }
      if (message.type === 'EVENT' && typeof message.sequence === 'number')
        this.lastEventSequence = Math.max(this.lastEventSequence, message.sequence);
      this.handlers.onMessage(message);
    };
    socket.onclose = () => {
      if (socket !== this.currentSocket) return;
      if (this.closed) {
        this.handlers.onStatus?.('CLOSED');
        return;
      }
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      if (socket !== this.currentSocket) return;
      this.scheduleReconnect();
    };
  }

  sendAction(action: PvpAction, sequence: number, requestId = this.requestId()): string {
    const payload = JSON.stringify({ type: 'ACTION', requestId, sequence, action });
    this.pendingActions.set(requestId, { payload, sequence });
    const queued = this.outbound;
    const readyState = (this.currentSocket as PvpSocketLike & { readonly readyState?: number })
      .readyState;
    if (readyState === undefined || readyState === 1) {
      try {
        this.currentSocket.send(payload);
        return requestId;
      } catch {
        // Leave the action pending and retry it after reconnect.
      }
    }
    queued.push(payload);
    return requestId;
  }

  resync(afterEventSequence = this.lastEventSequence): void {
    this.sendRaw(JSON.stringify({ type: 'RESYNC', afterEventSequence }));
  }

  retryAction(requestId: string): boolean {
    const pending = this.pendingActions.get(requestId);
    if (pending === undefined) return false;
    this.sendRaw(pending.payload);
    return true;
  }

  ping(): void {
    this.sendRaw(JSON.stringify({ type: 'PING', requestId: this.requestId() }));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.currentSocket.close();
  }

  private sendRaw(
    data: string | { readonly type: 'RESYNC'; readonly afterEventSequence: number },
  ): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const readyState = (this.currentSocket as PvpSocketLike & { readonly readyState?: number })
      .readyState;
    if (readyState === undefined || readyState === 1) {
      try {
        this.currentSocket.send(payload);
        return;
      } catch {
        // Queue the intent and let the reconnect path deliver it.
      }
    }
    this.outbound.push(payload);
  }

  private scheduleReconnect(socket = this.currentSocket): void {
    if (socket !== this.currentSocket) return;
    if (this.closed || this.reconnectTimer !== undefined) return;
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.closed = true;
      this.handlers.onStatus?.('CLOSED');
      try {
        socket.close();
      } catch {
        // The socket is already unavailable.
      }
      return;
    }
    this.handlers.onStatus?.('RECONNECTING');
    const delay = this.reconnectDelayMs * Math.min(8, 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closed) return;
      this.currentSocket = this.socketFactory(this.url);
      this.bindSocket(this.currentSocket, true);
    }, delay);
    try {
      socket.close();
    } catch {
      // The close event will be delivered by the socket implementation when available.
    }
  }

  private requestId(): string {
    this.nextRequest += 1;
    return `web-${this.clientId}-${String(this.nextRequest)}`;
  }
}

export function webSocketUrl(baseUrl: string | undefined, matchId: string): string {
  const source =
    baseUrl ??
    import.meta.env.VITE_API_URL ??
    (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  const url = new URL(`/ws/matches/${encodeURIComponent(matchId)}`, source);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function randomClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseServerMessage(value: unknown): PvpServerMessage | null {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string' || parsed.protocolVersion !== 1)
    return null;
  if (parsed.type === 'STATE') {
    return isNonNegativeInteger(parsed.actionSequence) &&
      isNonNegativeInteger(parsed.eventSequence) &&
      isNonNegativeInteger(parsed.snapshotActionIndex) &&
      typeof parsed.matchId === 'string' &&
      isRecord(parsed.state) &&
      (parsed.requestId === undefined || typeof parsed.requestId === 'string')
      ? (parsed as PvpServerMessage)
      : null;
  }
  if (parsed.type === 'EVENT') {
    return isNonNegativeInteger(parsed.sequence) &&
      typeof parsed.matchId === 'string' &&
      isRecord(parsed.event)
      ? (parsed as PvpServerMessage)
      : null;
  }
  if (parsed.type === 'ERROR') {
    return typeof parsed.code === 'string' &&
      typeof parsed.message === 'string' &&
      (parsed.requestId === undefined || typeof parsed.requestId === 'string')
      ? (parsed as PvpServerMessage)
      : null;
  }
  return parsed.type === 'PONG' &&
    typeof parsed.serverTime === 'string' &&
    (parsed.requestId === undefined || typeof parsed.requestId === 'string')
    ? (parsed as PvpServerMessage)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
