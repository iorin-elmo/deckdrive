import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';

import type { PlayerId } from '@deck-drive/game-engine';

import { MatchSession } from './session.js';
import { parseClientMessage, type ServerMessage } from './protocol.js';

export interface PvpWebSocketRegistry {
  find(matchId: string): MatchSession | undefined;
  /** The O00 session resolver can be injected here when its branch is merged. */
  authenticate(request: IncomingMessage): Promise<PlayerId | null> | PlayerId | null;
}

export interface PvpWebSocketOptions {
  readonly maxMessageBytes?: number;
  readonly tickIntervalMs?: number;
  /** Browser origins allowed to use cookie-backed WebSocket authentication. */
  readonly allowedOrigins?: readonly string[];
}

/** Attaches the authenticated `/ws/matches/:matchId` protocol to an HTTP server. */
export function attachPvpWebSocket(
  server: Server,
  registry: PvpWebSocketRegistry,
  options: PvpWebSocketOptions = {},
): () => void {
  const maxMessageBytes = options.maxMessageBytes ?? 64 * 1024;
  const tickIntervalMs = options.tickIntervalMs ?? 1_000;
  const connections = new Set<PvpWebSocketConnection>();
  const onUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
    void acceptUpgrade(
      request,
      socket,
      head,
      registry,
      connections,
      maxMessageBytes,
      options.allowedOrigins ?? [],
    );
  };
  server.on('upgrade', onUpgrade);
  const timer = setInterval(() => {
    for (const connection of connections) connection.session.tick();
  }, tickIntervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    server.off('upgrade', onUpgrade);
    for (const connection of connections) connection.close(1001, 'Server stopped.');
    connections.clear();
  };
}

async function acceptUpgrade(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
  registry: PvpWebSocketRegistry,
  connections: Set<PvpWebSocketConnection>,
  maxMessageBytes: number,
  allowedOrigins: readonly string[],
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const matchId = url.pathname.match(/^\/ws\/matches\/([^/]+)$/u)?.[1];
  if (
    request.method !== 'GET' ||
    matchId === undefined ||
    request.headers.upgrade?.toLowerCase() !== 'websocket' ||
    request.headers['sec-websocket-version'] !== '13'
  ) {
    rejectUpgrade(socket, 400, 'Bad WebSocket request.');
    return;
  }
  const origin = request.headers.origin;
  if (origin !== undefined && !allowedOrigins.includes(origin)) {
    rejectUpgrade(socket, 403, 'Origin is not allowed.');
    return;
  }
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string' || key.length === 0) {
    rejectUpgrade(socket, 400, 'Missing WebSocket key.');
    return;
  }
  const playerId = await registry.authenticate(request);
  if (playerId === null) {
    rejectUpgrade(socket, 401, 'Authentication required.');
    return;
  }
  const session = registry.find(matchId);
  if (session === undefined) {
    rejectUpgrade(socket, 404, 'Match not found.');
    return;
  }
  const connection = new PvpWebSocketConnection(socket, session, playerId, maxMessageBytes);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${webSocketAccept(key)}`,
      '\r\n',
    ].join('\r\n'),
  );
  connections.add(connection);
  connection.start(head);
}

class PvpWebSocketConnection {
  private buffer = Buffer.alloc(0);
  private closed = false;

  constructor(
    private readonly socket: Socket,
    readonly session: MatchSession,
    private readonly playerId: PlayerId,
    private readonly maxMessageBytes: number,
  ) {}

  start(head: Buffer): void {
    this.session.connect({ playerId: this.playerId, send: (message) => this.sendJson(message) });
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk));
    this.socket.once('close', () => {
      this.closed = true;
      this.session.disconnect(this.playerId);
    });
    this.socket.once('error', () => {
      this.closed = true;
      this.session.disconnect(this.playerId);
    });
    if (head.length > 0) this.onData(head);
  }

  sendJson(message: ServerMessage): void {
    if (this.closed) return;
    this.sendFrame(0x1, Buffer.from(JSON.stringify(message), 'utf8'));
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    const reasonBytes = Buffer.from(reason, 'utf8').subarray(0, 123);
    const payload = Buffer.alloc(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    this.sendFrame(0x8, payload);
    this.closed = true;
    this.socket.end();
    this.session.disconnect(this.playerId);
  }

  private onData(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > this.maxMessageBytes * 2) {
      this.close(1009, 'Message too large.');
      return;
    }
    while (true) {
      let frame: WebSocketFrame | null;
      try {
        frame = readFrame(this.buffer, this.maxMessageBytes);
      } catch {
        this.close(1009, 'Invalid or oversized frame.');
        return;
      }
      if (frame === null) return;
      this.buffer = this.buffer.subarray(frame.bytesConsumed);
      if (frame.opcode === 0x8) {
        this.close(1000, '');
        return;
      }
      if (frame.opcode === 0x9) {
        this.sendFrame(0xa, frame.payload);
        continue;
      }
      if (frame.opcode !== 0x1 || !frame.fin) {
        this.close(1002, 'Only complete text frames are supported.');
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(frame.payload.toString('utf8')) as unknown;
      } catch {
        this.sendJson({
          type: 'ERROR',
          protocolVersion: 1,
          code: 'INVALID_MESSAGE',
          message: 'Message must contain valid JSON.',
        });
        continue;
      }
      if (parseClientMessage(value) === null) {
        this.sendJson({
          type: 'ERROR',
          protocolVersion: 1,
          code: 'INVALID_MESSAGE',
          message: 'Message shape is invalid.',
        });
        continue;
      }
      const actionRequest =
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'ACTION' &&
        'requestId' in value &&
        typeof value.requestId === 'string'
          ? value.requestId
          : undefined;
      const wasCached =
        actionRequest === undefined
          ? false
          : this.session.hasCachedRequest(this.playerId, actionRequest);
      void this.session.receive(this.playerId, value).then((messages) => {
        // MatchSession broadcasts accepted actions. Only direct responses are
        // sent here for PING, RESYNC, and request errors.
        if (actionRequest !== undefined && !wasCached) {
          for (const message of messages) {
            if (message.type === 'ERROR') this.sendJson(message);
          }
          return;
        }
        for (const message of messages) this.sendJson(message);
      });
    }
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    const length = payload.length;
    let header: Buffer;
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, length]);
    } else if (length <= 65_535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }
}

interface WebSocketFrame {
  readonly fin: boolean;
  readonly opcode: number;
  readonly payload: Buffer;
  readonly bytesConsumed: number;
}

function readFrame(buffer: Buffer, maximumPayloadBytes: number): WebSocketFrame | null {
  if (buffer.length < 2) return null;
  const first = buffer[0]!;
  const second = buffer[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    const high = buffer.readUInt32BE(2);
    const low = buffer.readUInt32BE(6);
    if (high !== 0 || low > maximumPayloadBytes) throw new Error('WebSocket frame is too large.');
    length = low;
    offset = 10;
  }
  if (!masked || length > maximumPayloadBytes) throw new Error('Invalid WebSocket frame.');
  if (buffer.length < offset + 4 + length) return null;
  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  for (let index = 0; index < payload.length; index += 1)
    payload[index] = payload[index]! ^ mask[index % 4]!;
  return { fin, opcode, payload, bytesConsumed: offset + length };
}

function webSocketAccept(key: string): string {
  return createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
}

function rejectUpgrade(socket: Socket, status: number, message: string): void {
  socket.end(
    `HTTP/1.1 ${String(status)} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}
