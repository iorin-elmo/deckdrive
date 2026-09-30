export type PvpAction =
  | { readonly type: 'END_TURN'; readonly playerId: string }
  | {
      readonly type: 'PLAY_CARD';
      readonly playerId: string;
      readonly cardInstanceId: string;
      readonly targetId?: string;
    };

export type PvpServerMessage =
  | { readonly type: 'STATE'; readonly [key: string]: unknown }
  | { readonly type: 'EVENT'; readonly [key: string]: unknown }
  | { readonly type: 'ERROR'; readonly [key: string]: unknown }
  | { readonly type: 'PONG'; readonly [key: string]: unknown };

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
  readonly onMalformedMessage?: () => void;
  readonly onStatus?: (status: 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED') => void;
}

export interface PvpSocketClientOptions {
  readonly baseUrl?: string;
  readonly socketFactory?: (url: string) => PvpSocketLike;
  readonly reconnectDelayMs?: number;
}

/** Browser transport only: it sends intent and renders server messages. */
export class PvpSocketClient {
  private currentSocket: PvpSocketLike;
  private nextRequest = 0;
  private readonly clientId = randomClientId();
  private readonly socketFactory: (url: string) => PvpSocketLike;
  private readonly url: string;
  private readonly reconnectDelayMs: number;
  private readonly handlers: PvpSocketHandlers;
  private readonly outbound: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closed = false;
  private lastEventSequence = 0;

  constructor(matchId: string, handlers: PvpSocketHandlers, options: PvpSocketClientOptions = {}) {
    this.socketFactory =
      options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as PvpSocketLike);
    this.url = webSocketUrl(options.baseUrl, matchId);
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
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
      this.reconnectAttempt = 0;
      this.handlers.onStatus?.('OPEN');
      this.sendRaw({ type: 'RESYNC', afterEventSequence: this.lastEventSequence });
      while (this.outbound.length > 0) this.sendRaw(this.outbound.shift()!);
    };
    socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message === null) {
        this.handlers.onMalformedMessage?.();
        return;
      }
      if (message.type === 'STATE' && typeof message.eventSequence === 'number')
        this.lastEventSequence = Math.max(this.lastEventSequence, message.eventSequence);
      if (message.type === 'EVENT' && typeof message.sequence === 'number')
        this.lastEventSequence = Math.max(this.lastEventSequence, message.sequence);
      this.handlers.onMessage(message);
    };
    socket.onclose = () => {
      if (this.closed) {
        this.handlers.onStatus?.('CLOSED');
        return;
      }
      this.scheduleReconnect();
    };
    socket.onerror = () => this.scheduleReconnect();
  }

  sendAction(action: PvpAction, sequence: number, requestId = this.requestId()): string {
    this.sendRaw(JSON.stringify({ type: 'ACTION', requestId, sequence, action }));
    return requestId;
  }

  resync(afterEventSequence: number): void {
    this.lastEventSequence = Math.max(this.lastEventSequence, afterEventSequence);
    this.sendRaw(JSON.stringify({ type: 'RESYNC', afterEventSequence }));
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

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== undefined) return;
    this.handlers.onStatus?.('RECONNECTING');
    const delay = this.reconnectDelayMs * Math.min(8, 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closed) return;
      this.currentSocket = this.socketFactory(this.url);
      this.bindSocket(this.currentSocket, true);
    }, delay);
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
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !('type' in parsed) ||
    (parsed.type !== 'STATE' &&
      parsed.type !== 'EVENT' &&
      parsed.type !== 'ERROR' &&
      parsed.type !== 'PONG')
  )
    return null;
  return parsed as PvpServerMessage;
}
