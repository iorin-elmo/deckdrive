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
}

export interface PvpSocketClientOptions {
  readonly baseUrl?: string;
  readonly socketFactory?: (url: string) => PvpSocketLike;
}

/** Browser transport only: it sends intent and renders server messages. */
export class PvpSocketClient {
  readonly socket: PvpSocketLike;
  private nextRequest = 0;

  constructor(matchId: string, handlers: PvpSocketHandlers, options: PvpSocketClientOptions = {}) {
    const factory =
      options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as PvpSocketLike);
    this.socket = factory(webSocketUrl(options.baseUrl, matchId));
    this.socket.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message === null) {
        handlers.onMalformedMessage?.();
        return;
      }
      handlers.onMessage(message);
    };
  }

  sendAction(action: PvpAction, sequence: number, requestId = this.requestId()): string {
    this.socket.send(JSON.stringify({ type: 'ACTION', requestId, sequence, action }));
    return requestId;
  }

  resync(afterEventSequence: number): void {
    this.socket.send(JSON.stringify({ type: 'RESYNC', afterEventSequence }));
  }

  ping(): void {
    this.socket.send(JSON.stringify({ type: 'PING', requestId: this.requestId() }));
  }

  close(): void {
    this.socket.close();
  }

  private requestId(): string {
    this.nextRequest += 1;
    return `web-${String(this.nextRequest)}`;
  }
}

export function webSocketUrl(baseUrl: string | undefined, matchId: string): string {
  const source =
    baseUrl ?? (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  const url = new URL(`/ws/matches/${encodeURIComponent(matchId)}`, source);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
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
