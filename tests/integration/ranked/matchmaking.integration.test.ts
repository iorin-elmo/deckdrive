import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  createInitialBattleState,
  type MatchId,
  type PlayerId,
} from '../../../packages/game-engine/src/index.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { basicCardDefinitions } from '../../../packages/card-definitions/src/index.js';
import { ApiApplication } from '../../../apps/api/src/api/application.js';
import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient } from '../../../apps/api/src/generated/prisma/client.js';
import { PrismaPvpMatchPersistence } from '../../../apps/api/src/pvp/persistence.js';
import { PvpMatchService } from '../../../apps/api/src/pvp/service.js';
import { PrismaRankedSettlement } from '../../../apps/api/src/ranked/prisma-ranked-settlement.js';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for ranked integration tests.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

describe('ranked matchmaking and authenticated reads', () => {
  const seasonId = randomUUID();
  const nextSeasonId = randomUUID();
  const playerIds: string[] = [];
  const userIds: string[] = [];
  const deckIds: string[] = [];
  const matchIds: string[] = [];
  const serviceOne = new PvpMatchService(prisma);
  const serviceTwo = new PvpMatchService(prisma);

  beforeAll(async () => {
    const versions = await prisma.cardVersion.findMany({
      where: { cardId: { in: basicCardDefinitions.map((card) => card.id) }, version: '1.0.0' },
      orderBy: { id: 'asc' },
    });
    expect(versions).toHaveLength(10);
    for (let index = 0; index < 4; index += 1) {
      const user = await prisma.user.create({
        data: { displayName: `K03 ${index}`, player: { create: {} } },
        include: { player: true },
      });
      userIds.push(user.id);
      playerIds.push(user.player!.id);
      const deck = await prisma.deck.create({
        data: {
          playerId: user.player!.id,
          name: 'Ranked integration',
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
    }
    const now = Date.now();
    await new PrismaRankedSettlement(prisma).activateSeason({
      id: seasonId,
      startsAt: new Date(now - 24 * 60 * 60_000),
      endsAt: new Date(now + 24 * 60 * 60_000),
      initialRating: 1500,
      resetRetention: 0.5,
      at: new Date(now),
    });
  });

  afterAll(async () => {
    await prisma.ratingHistory.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.ratingAbuseFlag.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankedQueueEntry.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankedMatchPlayer.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankedMatch.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchAction.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchEvent.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchSnapshot.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchPlayer.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    await prisma.playerSeasonRating.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.season.deleteMany({ where: { id: { in: [seasonId, nextSeasonId] } } });
    await prisma.deckCard.deleteMany({ where: { deckId: { in: deckIds } } });
    await prisma.deck.deleteMany({ where: { id: { in: deckIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const request = (
    application: ApiApplication,
    method: string,
    path: string,
    index: number,
    body?: unknown,
    query?: Record<string, string>,
  ) =>
    application.handle({
      method,
      path,
      headers: { 'x-deckdrive-player-id': playerIds[index] },
      ...(body === undefined ? {} : { body }),
      ...(query === undefined ? {} : { query }),
    });

  it('serializes duplicate queue requests, restores the match, and settles an authenticated forfeit', async () => {
    const first = await Promise.all([
      serviceOne.enqueueRanked(playerIds[0]!, deckIds[0]!),
      serviceTwo.enqueueRanked(playerIds[0]!, deckIds[0]!),
    ]);
    expect(first[0]).toEqual(first[1]);
    expect(first[0]!.status).toBe('QUEUED');
    const matched = await serviceTwo.enqueueRanked(playerIds[1]!, deckIds[1]!);
    expect(matched.status).toBe('MATCHED');
    if (matched.status !== 'MATCHED') throw new Error('Expected ranked match.');
    matchIds.push(matched.matchId);
    expect(await serviceOne.enqueueRanked(playerIds[1]!, randomUUID())).toEqual({
      status: 'MATCHED',
      queueId: matched.queueId,
      matchId: matched.matchId,
    });
    const entries = await prisma.rankedQueueEntry.findMany({ where: { matchId: matched.matchId } });
    expect(entries).toHaveLength(2);
    const matchedCancellation = await request(
      new ApiApplication(prisma, { NODE_ENV: 'test' }, serviceTwo),
      'DELETE',
      `/api/v1/matches/ranked/queue/${matched.queueId}`,
      1,
    );
    expect(matchedCancellation).toMatchObject({
      status: 200,
      body: { status: 'MATCHED', matchId: matched.matchId },
    });
    const rankedMatch = await prisma.rankedMatch.findUniqueOrThrow({
      where: { matchId: matched.matchId },
      select: { seasonId: true },
    });
    expect(entries.every((entry) => entry.seasonId === rankedMatch.seasonId)).toBe(true);
    expect(await prisma.rankedMatchPlayer.count({ where: { matchId: matched.matchId } })).toBe(2);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matched.matchId } })).mode).toBe(
      'RANKED',
    );

    const restarted = new PvpMatchService(prisma);
    await restarted.restoreActive();
    expect((await restarted.find(matched.matchId))?.isActive).toBe(true);
    expect(await restarted.rankedStatus(playerIds[0]!, first[0]!.queueId)).toEqual({
      status: 'MATCHED',
      queueId: first[0]!.queueId,
      matchId: matched.matchId,
    });
    await expect(restarted.rankedStatus(playerIds[1]!, first[0]!.queueId)).rejects.toMatchObject({
      code: 'QUEUE_NOT_FOUND',
    });
    await expect(restarted.rankedStatus(playerIds[0]!, 'malformed')).rejects.toMatchObject({
      code: 'QUEUE_NOT_FOUND',
    });

    const api = new ApiApplication(prisma, { NODE_ENV: 'test' }, restarted);
    expect(
      await api.handle({ method: 'GET', path: '/api/v1/ranked/profile', headers: {} }),
    ).toMatchObject({ status: 401 });
    const profile = await request(api, 'GET', '/api/v1/ranked/profile', 0);
    expect(profile.body).toMatchObject({
      rating: 1500,
      rank: { name: 'GOLD', division: 'II' },
      rr: 50,
    });
    const matchResponse = await request(api, 'GET', `/api/v1/matches/${matched.matchId}`, 0);
    expect(matchResponse.status).toBe(200);
    expect(JSON.stringify(matchResponse.body)).not.toContain('"seed"');
    const projected = matchResponse.body as {
      state: { players: readonly { id: string; hand: unknown[]; drawPile: unknown[] }[] };
    };
    expect(projected.state.players.find((player) => player.id === playerIds[1])).toMatchObject({
      hand: [],
      drawPile: [],
    });
    expect(await request(api, 'GET', `/api/v1/matches/${matched.matchId}`, 2)).toMatchObject({
      status: 404,
    });

    const surrendered = await request(
      api,
      'POST',
      `/api/v1/matches/${matched.matchId}/forfeit`,
      1,
      {
        outcome: 'WIN',
        rating: 99999,
      },
    );
    expect(surrendered).toMatchObject({ status: 200, body: { status: 'COMPLETED' } });
    const history = await prisma.ratingHistory.findMany({ where: { matchId: matched.matchId } });
    expect(history).toHaveLength(2);
    expect(history.find((row) => row.playerId === playerIds[1])).toMatchObject({ outcome: 'LOSS' });
    expect(history.find((row) => row.playerId === playerIds[1])!.delta).toBeLessThanOrEqual(0);
    expect(
      (await prisma.matchAction.findFirstOrThrow({ where: { matchId: matched.matchId } })).source,
    ).toBe('FORFEIT');
    const ownHistory = await request(api, 'GET', '/api/v1/ranked/history', 1);
    expect(ownHistory.status).toBe(200);
    const body = ownHistory.body as { items: readonly { id: string; outcome: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.outcome).toBe('LOSS');
    expect(JSON.stringify(body)).not.toContain(playerIds[0]!);
    const otherHistory = await request(api, 'GET', '/api/v1/ranked/history', 0);
    const otherCursor = (otherHistory.body as { items: readonly { id: string }[] }).items[0]!.id;
    expect(
      await request(api, 'GET', '/api/v1/ranked/history', 1, undefined, { cursor: otherCursor }),
    ).toMatchObject({ status: 404 });
    expect(
      await request(api, 'GET', '/api/v1/ranked/history', 1, undefined, { cursor: 'malformed' }),
    ).toMatchObject({ status: 404 });
  });

  it('widens the Elo window and creates one match under competing workers', async () => {
    await prisma.playerSeasonRating.createMany({
      data: [
        { seasonId, playerId: playerIds[2]!, rating: 1500 },
        { seasonId, playerId: playerIds[3]!, rating: 1800 },
      ],
    });
    const first = await serviceOne.enqueueRanked(playerIds[2]!, deckIds[2]!);
    const afterRestart = new PvpMatchService(prisma);
    expect(await afterRestart.rankedStatus(playerIds[2]!, first.queueId)).toEqual({
      status: 'WAITING',
      queueId: first.queueId,
    });
    const second = await serviceTwo.enqueueRanked(playerIds[3]!, deckIds[3]!);
    expect(first.status).toBe('QUEUED');
    expect(second.status).toBe('QUEUED');
    await prisma.rankedQueueEntry.update({
      where: { id: first.queueId },
      data: { createdAt: new Date(Date.now() - 3 * 60_000) },
    });
    const competing = await Promise.all([
      serviceOne.enqueueRanked(playerIds[3]!, deckIds[3]!),
      serviceTwo.enqueueRanked(playerIds[3]!, deckIds[3]!),
    ]);
    expect(competing[0]).toEqual(competing[1]);
    expect(competing[0]!.status).toBe('MATCHED');
    if (competing[0]!.status !== 'MATCHED') throw new Error('Expected widened match.');
    matchIds.push(competing[0]!.matchId);
    expect(await prisma.match.count({ where: { mode: 'RANKED', id: competing[0]!.matchId } })).toBe(
      1,
    );
    expect(await prisma.rankedQueueEntry.count({ where: { matchId: competing[0]!.matchId } })).toBe(
      2,
    );

    const session = await serviceOne.find(competing[0]!.matchId);
    expect(session).toBeDefined();
    const firstClient = { playerId: playerIds[2]! as PlayerId, send: vi.fn() };
    const secondClient = { playerId: playerIds[3]! as PlayerId, send: vi.fn() };
    session!.connect(firstClient);
    session!.connect(secondClient);
    session!.disconnect(secondClient);
    session!.tick(Date.now() + 60_001);
    await vi.waitFor(async () => {
      expect(
        (await prisma.match.findUniqueOrThrow({ where: { id: competing[0]!.matchId } })).status,
      ).toBe('COMPLETED');
    });
    expect(
      await prisma.ratingHistory.findFirst({
        where: { matchId: competing[0]!.matchId, playerId: playerIds[3]! },
        select: { outcome: true },
      }),
    ).toMatchObject({ outcome: 'LOSS' });
  });

  it('keeps Casual and Private outside rating settlement', async () => {
    const persistence = new PrismaPvpMatchPersistence(prisma);
    for (const mode of ['CASUAL', 'PRIVATE'] as const) {
      const matchId = randomUUID();
      matchIds.push(matchId);
      const state = createInitialBattleState({
        matchId: matchId as MatchId,
        engineVersion: '1.0.0',
        rulesVersion: '1.0.0',
        cardDataVersion: '1.0.0',
        seed: matchId,
        initialDrawCount: 0,
        turnDrawCount: 0,
        players: playerIds.slice(0, 2).map((id) => ({ id: id as PlayerId, drawPile: [] })),
      });
      await persistence.create(
        state,
        [
          { playerId: playerIds[0]!, deckSnapshot: {} },
          { playerId: playerIds[1]!, deckSnapshot: {} },
        ],
        { mode },
      );
      await persistence.abandon(matchId);
      expect(await prisma.rankedMatch.count({ where: { matchId } })).toBe(0);
      expect(await prisma.ratingHistory.count({ where: { matchId } })).toBe(0);
    }
  });

  it('rate limits repeated ranked enqueue requests', async () => {
    const api = new ApiApplication(prisma, { NODE_ENV: 'test' }, new PvpMatchService(prisma));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(api, 'POST', '/api/v1/matches/ranked', 0, {
        deckId: deckIds[0],
      });
      expect(response.status).toBe(202);
    }
    expect(
      await request(api, 'POST', '/api/v1/matches/ranked', 0, { deckId: deckIds[0] }),
    ).toMatchObject({
      status: 429,
      body: { error: 'RATE_LIMITED' },
    });
  });

  it('expires a waiting queue when a new season begins', async () => {
    const previous = await prisma.rankedQueueEntry.findFirstOrThrow({
      where: { playerId: playerIds[0]!, status: 'WAITING' },
    });
    const boundary = new Date(Date.now() - 1_000);
    await prisma.season.update({ where: { id: seasonId }, data: { endsAt: boundary } });
    await new PrismaRankedSettlement(prisma).activateSeason({
      id: nextSeasonId,
      startsAt: boundary,
      endsAt: new Date(Date.now() + 24 * 60 * 60_000),
      initialRating: 1500,
      resetRetention: 0.5,
      at: new Date(),
    });
    expect(await serviceOne.rankedStatus(playerIds[0]!, previous.id)).toEqual({
      status: 'EXPIRED',
      queueId: previous.id,
    });
    const next = await serviceOne.enqueueRanked(playerIds[0]!, deckIds[0]!);
    expect(next.status).toBe('QUEUED');
    expect(next.queueId).not.toBe(previous.id);
    const api = new ApiApplication(prisma, { NODE_ENV: 'test' }, serviceOne);
    expect(
      await request(api, 'DELETE', `/api/v1/matches/ranked/queue/${next.queueId}`, 1),
    ).toMatchObject({ status: 404 });
    expect(
      await request(api, 'DELETE', `/api/v1/matches/ranked/queue/${next.queueId}`, 0),
    ).toMatchObject({
      status: 200,
      body: { status: 'CANCELLED', queueId: next.queueId },
    });
    expect(
      await request(api, 'GET', `/api/v1/matches/ranked/queue/${next.queueId}`, 0),
    ).toMatchObject({
      status: 200,
      body: { status: 'CANCELLED' },
    });
    const replacement = await serviceOne.enqueueRanked(playerIds[0]!, deckIds[0]!);
    expect(replacement.status).toBe('QUEUED');
    expect(replacement.queueId).not.toBe(next.queueId);
    expect(
      (await prisma.rankedQueueEntry.findUniqueOrThrow({ where: { id: previous.id } })).status,
    ).toBe('EXPIRED');
  });
});
