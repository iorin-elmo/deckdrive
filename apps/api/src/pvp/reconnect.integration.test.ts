import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { connect, type Socket } from 'node:net';

import { PrismaPg } from '@prisma/adapter-pg';
import type { PlayerId } from '@deck-drive/game-engine';
import { afterAll, describe, expect, it } from 'vitest';

import { ApiApplication } from '../api/application.js';
import { closePvpWebSocket, createApiHttpServer } from '../api/http.js';
import { parseCookies, sessionCookieName } from '../auth/cookies.js';
import { OAuthService } from '../auth/oauth-service.js';
import { loadRootEnvironment } from '../database/load-environment.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PvpMatchService } from './service.js';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for PvP reconnect integration test.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

type WireMessage = { readonly type?: string; readonly [key: string]: unknown };

class TestSocket {
  private buffer = Buffer.alloc(0);
  private readonly pending: WireMessage[] = [];
  private readonly waiters: Array<(message: WireMessage) => boolean> = [];

  private constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => this.receive(chunk));
  }

  static async open(port: number, matchId: string, cookie: string): Promise<TestSocket> {
    const socket = connect(port, '127.0.0.1');
    const client = new TestSocket(socket);
    socket.write(
      [
        `GET /ws/matches/${matchId} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGVzdC1rZXktMTIzNDU2',
        `Cookie: ${cookie}`,
        '',
        '',
      ].join('\r\n'),
    );
    await client.waitFor((message) => message.type === 'HANDSHAKE');
    return client;
  }

  send(message: unknown): void {
    const payload = Buffer.from(JSON.stringify(message));
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.from(payload);
    for (let index = 0; index < masked.length; index += 1)
      masked[index] = masked[index]! ^ mask[index % 4]!;
    const header =
      payload.length < 126
        ? Buffer.from([0x81, 0x80 | payload.length])
        : Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 0xff]);
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  async waitFor(predicate: (message: WireMessage) => boolean): Promise<WireMessage> {
    const queued = this.pending.findIndex(predicate);
    if (queued >= 0) return this.pending.splice(queued, 1)[0]!;
    return new Promise<WireMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for WebSocket message')),
        5_000,
      );
      this.waiters.push((message) => {
        if (!predicate(message)) return false;
        clearTimeout(timer);
        resolve(message);
        return true;
      });
    });
  }

  close(): void {
    this.socket.destroy();
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.subarray(0, 5).toString() === 'HTTP/') {
      const end = this.buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const header = this.buffer.subarray(0, end).toString();
      this.buffer = this.buffer.subarray(end + 4);
      if (!header.startsWith('HTTP/1.1 101 ')) throw new Error(header);
      this.deliver({ type: 'HANDSHAKE' });
    }
    while (this.buffer.length >= 2) {
      const code = this.buffer[1]! & 0x7f;
      const offset = code === 126 ? 4 : 2;
      if (code === 126 && this.buffer.length < 4) return;
      const length = code === 126 ? this.buffer.readUInt16BE(2) : code;
      if (this.buffer.length < offset + length) return;
      const opcode = this.buffer[0]! & 0xf;
      const payload = this.buffer.subarray(offset, offset + length);
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 1) this.deliver(JSON.parse(payload.toString()) as WireMessage);
    }
  }

  private deliver(message: WireMessage): void {
    const index = this.waiters.findIndex((waiter) => waiter(message) === true);
    if (index >= 0) this.waiters.splice(index, 1);
    else this.pending.push(message);
  }
}

describe('DB-backed PvP restart and reconnect', () => {
  afterAll(async () => prisma.$disconnect());

  it('restores cookie-authenticated state and missed events from Prisma after API restart', async () => {
    const suffix = randomUUID();
    const oauth = new OAuthService(prisma, { NODE_ENV: 'development' });
    const versions = await prisma.cardVersion.findMany({ take: 10, orderBy: { id: 'asc' } });
    expect(versions).toHaveLength(10);
    const users: string[] = [];
    const playerIds: string[] = [];
    const cookies: string[] = [];
    const csrfTokens: string[] = [];
    const deckIds: string[] = [];
    let server: Server | undefined;
    const sockets: TestSocket[] = [];
    let matchId: string | undefined;
    const boot = async () => {
      const service = new PvpMatchService(prisma, async (request) => {
        const token = parseCookies(request.headers.cookie)[sessionCookieName];
        const session = await oauth.session().authenticate(token);
        return (session?.playerId as PlayerId | undefined) ?? null;
      });
      await service.restoreActive();
      server = createApiHttpServer(
        new ApiApplication(prisma, { NODE_ENV: 'development' }, service),
        {
          pvpWebSocket: { registry: service, options: { tickIntervalMs: 10 } },
        },
      );
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing server port');
      return address.port;
    };
    const stop = async () => {
      if (!server) return;
      closePvpWebSocket(server);
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    };
    try {
      for (let index = 0; index < 2; index += 1) {
        const user = await prisma.user.create({
          data: {
            email: `pvp-reconnect-${suffix}-${index}@deckdrive.local`,
            displayName: `Player ${index}`,
          },
        });
        users.push(user.id);
        const player = await prisma.player.create({ data: { userId: user.id } });
        playerIds.push(player.id);
        const deck = await prisma.deck.create({
          data: {
            playerId: player.id,
            name: 'Reconnect E2E',
            cardDataVersion: '1.0.0',
            cards: {
              create: versions.map((version, position) => ({
                cardVersionId: version.id,
                position,
                quantity: 3,
              })),
            },
          },
        });
        deckIds.push(deck.id);
        const session = await oauth.session().create(user.id);
        cookies.push(oauth.sessionCookie(session)[0]!);
        csrfTokens.push(session.csrfToken);
      }
      let port = await boot();
      const post = async (path: string, index: number, body: unknown) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST',
          headers: {
            Cookie: cookies[index]!,
            'x-csrf-token': csrfTokens[index]!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(201);
        return response.json() as Promise<Record<string, string>>;
      };
      const invite = await post('/api/v1/matches/private', 0, { deckId: deckIds[0] });
      const joined = await post(`/api/v1/matches/private/${invite.inviteCode}/join`, 1, {
        deckId: deckIds[1],
      });
      matchId = joined.matchId;
      expect(matchId).toBeTruthy();
      const first = await TestSocket.open(port, matchId!, cookies[0]!);
      const second = await TestSocket.open(port, matchId!, cookies[1]!);
      sockets.push(first, second);
      const firstState = await first.waitFor((message) => message.type === 'STATE');
      await second.waitFor((message) => message.type === 'STATE');
      const active = (firstState.state as { activePlayerId: string }).activePlayerId;
      const actor = active === playerIds[0] ? first : second;
      const other = actor === first ? second : first;
      other.close();
      actor.send({
        type: 'ACTION',
        requestId: 'reconnect-e2e-action',
        sequence: 0,
        action: { type: 'END_TURN', playerId: active },
      });
      const advanced = await actor.waitFor(
        (message) => message.type === 'STATE' && message.actionSequence === 1,
      );
      expect(advanced.eventSequence).toBeGreaterThan(0);
      actor.close();
      await stop();
      expect(await prisma.matchAction.count({ where: { matchId: matchId! } })).toBe(1);
      // Simulate the stale row left behind if the final presence update failed
      // immediately before the old API process died.
      await prisma.matchPlayer.updateMany({
        where: { matchId: matchId! },
        data: { disconnectedAt: new Date(0) },
      });
      port = await boot();
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId! } })).status).toBe(
        'IN_PROGRESS',
      );
      expect(
        (
          await prisma.matchPlayer.findFirstOrThrow({ where: { matchId: matchId! } })
        ).disconnectedAt?.getTime(),
      ).toBeGreaterThan(Date.now() - 30_000);
      const recovered = await TestSocket.open(port, matchId!, cookies[actor === first ? 1 : 0]!);
      sockets.push(recovered);
      const snapshot = await recovered.waitFor((message) => message.type === 'STATE');
      expect(snapshot.actionSequence).toBe(1);
      expect(snapshot.state).toEqual(
        expect.objectContaining({ matchId, activePlayerId: expect.any(String) }),
      );
      recovered.send({ type: 'RESYNC', afterEventSequence: 0 });
      const missing = await recovered.waitFor(
        (message) =>
          message.type === 'EVENT' && (message.event as { type?: string }).type === 'TURN_ENDED',
      );
      expect(missing.event).toEqual(expect.objectContaining({ type: 'TURN_ENDED' }));
    } finally {
      for (const socket of sockets) socket.close();
      await stop();
      if (matchId) await prisma.match.delete({ where: { id: matchId } });
      for (const userId of users) await prisma.session.deleteMany({ where: { userId } });
      for (const deckId of deckIds) await prisma.deck.delete({ where: { id: deckId } });
      for (const playerId of playerIds) await prisma.player.delete({ where: { id: playerId } });
      for (const userId of users) await prisma.user.delete({ where: { id: userId } });
    }
  }, 30_000);
});
