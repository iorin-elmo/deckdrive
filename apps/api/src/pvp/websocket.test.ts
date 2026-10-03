import { connect, type Socket } from 'node:net';

import { describe, expect, it, vi } from 'vitest';
import { createInitialBattleState } from '@deck-drive/game-engine';
import type { BattleState, MatchId, PlayerId } from '@deck-drive/game-engine';

import { parseCookies, sessionCookieName } from '../auth/cookies.js';
import { sha256 } from '../auth/crypto.js';
import { OAuthService } from '../auth/oauth-service.js';
import { ApiApplication } from '../api/application.js';
import { MatchSession } from './session.js';
import type { PvpWebSocketRegistry } from './websocket.js';
import { closePvpWebSocket, createApiHttpServer } from '../api/http.js';

type WireMessage = { readonly type?: string; readonly [key: string]: unknown };

class RawWebSocketClient {
  private buffer = Buffer.alloc(0);
  private handshaken = false;
  private readonly messages: WireMessage[] = [];
  private readonly waiters: Array<{
    readonly predicate: (message: WireMessage) => boolean;
    readonly resolve: (message: WireMessage) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  }> = [];
  private resolveHandshake!: () => void;
  private rejectHandshake!: (error: Error) => void;
  private readonly handshake: Promise<void>;

  private constructor(
    private readonly socket: Socket,
    private readonly playerId: string,
  ) {
    this.handshake = new Promise<void>((resolve, reject) => {
      this.resolveHandshake = resolve;
      this.rejectHandshake = reject;
    });
    socket.on('data', (chunk) => this.receive(chunk));
    socket.once('error', (error) => {
      if (!this.handshaken) this.rejectHandshake(error);
      for (const waiter of this.waiters) waiter.reject(error);
      this.waiters.length = 0;
    });
  }

  static async open(port: number, playerId: string): Promise<RawWebSocketClient> {
    const socket = connect(port, '127.0.0.1');
    const client = new RawWebSocketClient(socket, playerId);
    socket.write(
      [
        'GET /ws/matches/match-1 HTTP/1.1',
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGVzdC1rZXktMTIzNDU2',
        `Cookie: deckdrive_session=session-${playerId}`,
        '',
        '',
      ].join('\r\n'),
    );
    await client.handshake;
    return client;
  }

  send(message: unknown): void {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const mask = Buffer.from([1, 2, 3, 4]);
    const maskedPayload = Buffer.from(payload);
    for (let index = 0; index < maskedPayload.length; index += 1)
      maskedPayload[index] = maskedPayload[index]! ^ mask[index % 4]!;
    if (payload.length >= 126) throw new Error('Test payload is unexpectedly large.');
    this.socket.write(
      Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, maskedPayload]),
    );
  }

  async waitFor(
    predicate: (message: WireMessage) => boolean,
    timeoutMs = 2_000,
    label = 'message',
  ): Promise<WireMessage> {
    const queuedIndex = this.messages.findIndex(predicate);
    if (queuedIndex >= 0) return this.messages.splice(queuedIndex, 1)[0]!;
    return new Promise<WireMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          new Error(
            `Timed out waiting for ${this.playerId} ${label}; queued=${JSON.stringify(this.messages)}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  close(): void {
    this.socket.destroy();
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshaken) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      if (!header.startsWith('HTTP/1.1 101 ')) {
        this.rejectHandshake(new Error(`Unexpected WebSocket response: ${header}`));
        this.socket.destroy();
        return;
      }
      this.buffer = this.buffer.subarray(headerEnd + 4);
      this.handshaken = true;
      this.resolveHandshake();
    }
    while (this.buffer.length >= 2) {
      const lengthCode = this.buffer[1]! & 0x7f;
      let headerLength = 2;
      let length = lengthCode;
      if (lengthCode === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        headerLength = 4;
      } else if (lengthCode === 127) throw new Error('Test frame is unexpectedly large.');
      if (this.buffer.length < headerLength + length) return;
      const opcode = this.buffer[0]! & 0x0f;
      const payload = this.buffer.subarray(headerLength, headerLength + length);
      this.buffer = this.buffer.subarray(headerLength + length);
      if (opcode !== 0x1) continue;
      const message = JSON.parse(payload.toString('utf8')) as WireMessage;
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const waiter = this.waiters.splice(waiterIndex, 1)[0]!;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else this.messages.push(message);
    }
  }
}

function battleState(): BattleState {
  return createInitialBattleState({
    matchId: 'match-1' as MatchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: '1.0.0',
    seed: 'websocket-test-seed',
    initialDrawCount: 0,
    turnDrawCount: 0,
    players: [
      { id: 'player-1' as PlayerId, drawPile: [] },
      { id: 'player-2' as PlayerId, drawPile: [] },
    ],
  });
}

describe('PvP WebSocket adapter', () => {
  it('rejects upgrades and active actions during maintenance, then resumes admission', async () => {
    const session = new MatchSession({ state: battleState(), now: () => 0 });
    const tick = vi.spyOn(session, 'tick');
    let maintenance = false;
    let checkFailed = false;
    const registry: PvpWebSocketRegistry = {
      find: () => session,
      authenticate: () => 'player-1' as PlayerId,
      sessions: () => [session],
    };
    const server = createApiHttpServer({} as ApiApplication, {
      pvpWebSocket: {
        registry,
        options: {
          maintenanceMode: () => {
            if (checkFailed) throw new Error('Flag storage is unavailable.');
            return maintenance;
          },
          tickIntervalMs: 20,
          sessionRevalidationIntervalMs: 60_000,
        },
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Server has no port.');
    let client: RawWebSocketClient | undefined;
    try {
      client = await RawWebSocketClient.open(address.port, 'player-1');
      await client.waitFor((message) => message.type === 'STATE');
      maintenance = true;
      tick.mockClear();
      client.send({
        type: 'ACTION',
        requestId: 'maintenance-action',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      });
      await expect(
        client.waitFor(
          (message) => message.type === 'ERROR' && message.requestId === 'maintenance-action',
        ),
      ).resolves.toMatchObject({ code: 'MAINTENANCE_MODE' });
      await expect(RawWebSocketClient.open(address.port, 'player-1')).rejects.toThrow(/503/u);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(tick).not.toHaveBeenCalled();
      expect(session.actionSequence).toBe(0);

      checkFailed = true;
      client.send({
        type: 'ACTION',
        requestId: 'failed-flag-check',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      });
      await expect(
        client.waitFor(
          (message) => message.type === 'ERROR' && message.requestId === 'failed-flag-check',
        ),
      ).resolves.toMatchObject({ code: 'MATCH_UNAVAILABLE' });
      await expect(RawWebSocketClient.open(address.port, 'player-1')).rejects.toThrow(/500/u);
      expect(session.actionSequence).toBe(0);

      checkFailed = false;
      maintenance = false;
      client.send({
        type: 'ACTION',
        requestId: 'maintenance-action',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      });
      await client.waitFor((message) => message.type === 'STATE' && message.actionSequence === 1);
      expect(session.actionSequence).toBe(1);
    } finally {
      client?.close();
      closePvpWebSocket(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('recovers projected state and missing events over a real authenticated socket', async () => {
    let session = new MatchSession({ state: battleState(), now: () => 0, snapshotInterval: 10 });
    const persisted = new Map<
      string,
      {
        readonly matchId: string;
        readonly state: BattleState;
        readonly actions: readonly unknown[];
      }
    >();
    const sessionRows = new Map([
      ['session-player-1', 'player-1'],
      ['session-player-2', 'player-2'],
    ]);
    const prisma = {
      session: {
        findUnique: async ({ where }: { readonly where: { readonly tokenHash: string } }) => {
          const token = [...sessionRows.keys()].find(
            (candidate) => sha256(candidate) === where.tokenHash,
          );
          const playerId = token === undefined ? undefined : sessionRows.get(token);
          return playerId === undefined
            ? null
            : {
                id: `db-${playerId}`,
                userId: `user-${playerId}`,
                csrfTokenHash: sha256(`csrf-${playerId}`),
                expiresAt: new Date(Date.now() + 60_000),
                revokedAt: null,
                user: { player: { id: playerId } },
              };
        },
      },
    };
    const oauth = new OAuthService(prisma as never, { NODE_ENV: 'test' });
    const pvp = {
      enqueueCasual: async () => {
        persisted.set('match-1', {
          matchId: 'match-1',
          state: session.currentState,
          actions: [],
        });
        return { status: 'MATCHED' as const, queueId: 'queue-1', matchId: 'match-1' };
      },
    };
    const registry: PvpWebSocketRegistry = {
      find: (matchId) => (matchId === 'match-1' ? session : undefined),
      authenticate: async (request) => {
        const token = parseCookies(request.headers.cookie)[sessionCookieName];
        const authenticated = await oauth.session().authenticate(token);
        return authenticated?.playerId as PlayerId | null;
      },
      sessions: () => [session],
    };
    const application = new ApiApplication(prisma as never, { NODE_ENV: 'test' }, pvp as never);
    const server = createApiHttpServer(application, {
      pvpWebSocket: {
        registry,
        options: { tickIntervalMs: 60_000, sessionRevalidationIntervalMs: 60_000 },
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Server has no port.');
    const port = address.port;
    let playerOne: RawWebSocketClient | undefined;
    let playerTwo: RawWebSocketClient | undefined;
    let reconnectedPlayerTwo: RawWebSocketClient | undefined;
    try {
      const matchCreation = await fetch(`http://127.0.0.1:${String(port)}/api/v1/matches/casual`, {
        method: 'POST',
        headers: {
          Cookie: 'deckdrive_session=session-player-1',
          'x-csrf-token': 'csrf-player-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deckId: 'deck-1' }),
      });
      await expect(matchCreation.json()).resolves.toEqual({
        status: 'MATCHED',
        matchId: 'match-1',
      });
      expect(matchCreation.status).toBe(201);
      expect(persisted.get('match-1')?.matchId).toBe('match-1');
      playerOne = await RawWebSocketClient.open(port, 'player-1');
      playerTwo = await RawWebSocketClient.open(port, 'player-2');
      await playerOne.waitFor((message) => message.type === 'STATE', 2_000, 'initial state');
      await playerTwo.waitFor((message) => message.type === 'STATE', 2_000, 'initial state');

      playerTwo.close();
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      playerOne.send({
        type: 'ACTION',
        requestId: 'real-socket-action',
        sequence: 0,
        action: { type: 'END_TURN', playerId: 'player-1' },
      });
      await playerOne.waitFor(
        (message) => message.type === 'STATE' && message.actionSequence === 1,
        2_000,
        'advanced state',
      );
      persisted.set('match-1', {
        matchId: 'match-1',
        state: session.currentState,
        actions: [{ type: 'END_TURN', playerId: 'player-1' }],
      });

      // Recreate the coordinator from the persisted replay boundary to cover
      // the process-restart path before the reconnecting browser joins.
      const restored = persisted.get('match-1')!;
      session = new MatchSession({
        state: restored.state,
        initialState: battleState(),
        now: () => 0,
        snapshotInterval: 10,
        history: {
          actions: restored.actions as [{ type: 'END_TURN'; playerId: PlayerId }],
          events: restored.state.events,
          snapshots: [
            {
              actionIndex: 1,
              eventSequence: session.eventSequence,
              state: session.currentState,
            },
          ],
        },
      });

      reconnectedPlayerTwo = await RawWebSocketClient.open(port, 'player-2');
      const state = await reconnectedPlayerTwo.waitFor(
        (message) => message.type === 'STATE' && message.actionSequence === 1,
        2_000,
        'reconnected state',
      );
      reconnectedPlayerTwo.send({ type: 'RESYNC', afterEventSequence: 0 });
      const event = await reconnectedPlayerTwo.waitFor(
        (message) => message.type === 'EVENT',
        2_000,
        'recovered event',
      );
      expect(state.state).toEqual(expect.objectContaining({ activePlayerId: 'player-2' }));
      expect(event.event).toEqual(expect.objectContaining({ type: 'TURN_ENDED' }));
    } finally {
      playerOne?.close();
      playerTwo?.close();
      reconnectedPlayerTwo?.close();
      closePvpWebSocket(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
