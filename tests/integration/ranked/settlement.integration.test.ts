import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createInitialBattleState,
  recordReplay,
  type CardDefinition,
  type CardInstanceId,
  type MatchId,
  type PlayerId,
} from '../../../packages/game-engine/src/index.js';
import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient } from '../../../apps/api/src/generated/prisma/client.js';
import { PrismaPvpMatchPersistence } from '../../../apps/api/src/pvp/persistence.js';
import { MatchSession } from '../../../apps/api/src/pvp/session.js';
import { PrismaRankedSettlement } from '../../../apps/api/src/ranked/prisma-ranked-settlement.js';
import { PrismaRankedAnalytics } from '../../../apps/api/src/ranked/prisma-analytics.js';
import { defaultRatingConfig, calculateRatingChange } from '../../../apps/api/src/ranked/rating.js';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for ranked integration tests.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const definition: CardDefinition = {
  id: 'ranked-lethal',
  cost: 0,
  effects: [{ type: 'DAMAGE', amount: 40, target: 'ENEMY' }],
};

describe('ranked settlement in PostgreSQL', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const referenceTime = Date.now();
  const seasonOneStartsAt = new Date(referenceTime - dayMs);
  const seasonTwoStartsAt = new Date(referenceTime + dayMs);
  const seasonTwoEndsAt = new Date(referenceTime + 2 * dayMs);
  const testId = randomUUID();
  const seasonOne = randomUUID();
  const seasonTwo = randomUUID();
  const playerIds: PlayerId[] = [];
  const userIds: string[] = [];
  const matchIds: string[] = [];
  const ranked = new PrismaRankedSettlement(prisma);
  const analytics = new PrismaRankedAnalytics(prisma);
  const persistence = new PrismaPvpMatchPersistence(prisma);

  beforeAll(async () => {
    for (const seat of [1, 2]) {
      const user = await prisma.user.create({
        data: { displayName: `Ranked ${seat}`, player: { create: {} } },
        include: { player: true },
      });
      userIds.push(user.id);
      playerIds.push(user.player!.id as PlayerId);
    }
    await ranked.activateSeason({
      id: seasonOne,
      startsAt: seasonOneStartsAt,
      endsAt: seasonTwoStartsAt,
      initialRating: 1500,
      resetRetention: 0.5,
      at: new Date(referenceTime),
    });
  });

  afterAll(async () => {
    await prisma.ratingHistory.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.ratingAbuseReview.deleteMany({ where: { flag: { playerId: { in: playerIds } } } });
    await prisma.ratingAbuseFlag.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankedMatchPlayer.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankedMatch.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchAction.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchEvent.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchSnapshot.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.matchPlayer.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
    await prisma.playerSeasonRating.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.season.deleteMany({ where: { id: { in: [seasonOne, seasonTwo] } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createRankedSession() {
    const matchId = `${testId}-${randomUUID()}`;
    matchIds.push(matchId);
    const cardId = randomUUID() as CardInstanceId;
    const initial = createInitialBattleState({
      matchId: matchId as MatchId,
      engineVersion: '1.0.0',
      rulesVersion: '1.0.0',
      cardDataVersion: '1.0.0',
      seed: matchId,
      initialDrawCount: 1,
      turnDrawCount: 0,
      players: [
        { id: playerIds[0]!, drawPile: [{ id: cardId, definitionId: definition.id }] },
        { id: playerIds[1]!, drawPile: [] },
      ],
    });
    await persistence.create(
      initial,
      [
        {
          playerId: playerIds[0]!,
          deckSnapshot: {
            cards: [
              {
                quantity: 1,
                cardVersion: {
                  id: 'ranked-test-card-version',
                  version: '1.0.0',
                  definition: { id: definition.id, class: 'SWORD' },
                },
              },
            ],
          },
        },
        { playerId: playerIds[1]!, deckSnapshot: {} },
      ],
      { mode: 'RANKED' },
    );
    return {
      matchId,
      initial,
      session: new MatchSession({
        state: initial,
        definitions: [definition],
        onAction: (action) => persistence.append(action),
      }),
      cardId,
    };
  }

  it('settles concurrent matches from replay data without a lost update', async () => {
    const matches = await Promise.all([createRankedSession(), createRankedSession()]);
    const snapshots = await prisma.rankedMatchPlayer.findMany({
      where: { matchId: { in: matches.map((match) => match.matchId) } },
    });
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every((snapshot) => snapshot.ratingAtStart === 1500)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.completedGamesAtStart === 0)).toBe(true);

    const responses = await Promise.all(
      matches.map(({ session, cardId }) =>
        session.receive(playerIds[0]!, {
          type: 'ACTION',
          requestId: 'lethal',
          sequence: 0,
          action: { type: 'PLAY_CARD', playerId: playerIds[0]!, cardInstanceId: cardId },
        }),
      ),
    );
    expect(
      responses.every((response) => response.some((message) => message.type === 'STATE')),
    ).toBe(true);
    const history = await prisma.ratingHistory.findMany({
      where: { matchId: { in: matches.map((match) => match.matchId) } },
    });
    expect(history).toHaveLength(4);
    expect(history.filter((entry) => entry.outcome === 'WIN').map((entry) => entry.delta)).toEqual([
      20, 20,
    ]);
    expect(history.filter((entry) => entry.outcome === 'LOSS').map((entry) => entry.delta)).toEqual(
      [-20, -20],
    );
    const wins = history.filter((entry) => entry.outcome === 'WIN');
    expect(wins.map((entry) => entry.ratingAtStart)).toEqual([1500, 1500]);
    expect(wins.map((entry) => entry.ratingBefore).sort()).toEqual([1500, 1520]);
    expect(wins.map((entry) => entry.ratingAfter).sort()).toEqual([1520, 1540]);
    expect(wins.every((entry) => entry.ratingConfigVersion === 'elo-damage-v1')).toBe(true);
    expect(wins.every((entry) => entry.damageDealt === 30 && entry.damageRatio === 1)).toBe(true);
    const ratings = await prisma.playerSeasonRating.findMany({ where: { seasonId: seasonOne } });
    expect(ratings.find((entry) => entry.playerId === playerIds[0])).toMatchObject({
      rating: 1540,
      completedGames: 2,
    });
    expect(ratings.find((entry) => entry.playerId === playerIds[1])).toMatchObject({
      rating: 1460,
      completedGames: 2,
    });
  });

  it('rolls back a failed settlement and retries without counting the match twice', async () => {
    const { matchId, initial, session, cardId } = await createRankedSession();
    const action = { type: 'PLAY_CARD' as const, playerId: playerIds[0]!, cardInstanceId: cardId };
    const message = { type: 'ACTION', requestId: 'retry', sequence: 0, action };
    await prisma.rankedMatch.update({
      where: { matchId },
      data: { ratingConfigVersion: 'unsupported-version' },
    });
    expect(await session.receive(playerIds[0]!, message)).toEqual([
      expect.objectContaining({ type: 'ERROR', code: 'MATCH_UNAVAILABLE' }),
    ]);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(await prisma.matchAction.count({ where: { matchId } })).toBe(0);
    expect(await prisma.ratingHistory.count({ where: { matchId } })).toBe(0);
    await prisma.rankedMatch.update({
      where: { matchId },
      data: { ratingConfigVersion: 'elo-damage-v1' },
    });
    const accepted = await session.receive(playerIds[0]!, message);
    expect(accepted.some((entry) => entry.type === 'STATE')).toBe(true);
    expect(await session.receive(playerIds[0]!, message)).toEqual(accepted);

    const replay = recordReplay(initial, [action], [definition]);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error('Expected a valid replay.');
    await prisma.$transaction((transaction) => ranked.settleMatch(transaction, replay.replay));
    expect(await prisma.ratingHistory.count({ where: { matchId } })).toBe(2);
    const ratings = await prisma.playerSeasonRating.findMany({ where: { seasonId: seasonOne } });
    expect(ratings.map((entry) => entry.completedGames)).toEqual([3, 3]);
  });

  it('counts disconnect episodes once and preserves reviewed flags across scans', async () => {
    const { matchId, session, cardId } = await createRankedSession();
    await persistence.setPlayerDisconnected(matchId, playerIds[0]!, null);
    await Promise.all([
      persistence.setPlayerDisconnected(matchId, playerIds[0]!, Date.now()),
      persistence.setPlayerDisconnected(matchId, playerIds[0]!, Date.now()),
    ]);
    for (let attempt = 0; attempt < 2; attempt++) {
      await persistence.setPlayerDisconnected(matchId, playerIds[0]!, null);
      await persistence.setPlayerDisconnected(matchId, playerIds[0]!, Date.now());
    }
    expect(
      await prisma.matchPlayer.findUniqueOrThrow({
        where: { matchId_playerId: { matchId, playerId: playerIds[0]! } },
      }),
    ).toMatchObject({ disconnectCount: 3 });
    await session.receive(playerIds[0]!, {
      type: 'ACTION',
      requestId: 'analytics-win',
      sequence: 0,
      action: { type: 'PLAY_CARD', playerId: playerIds[0]!, cardInstanceId: cardId },
    });
    expect((await analytics.scan(seasonOne)).inserted).toBeGreaterThanOrEqual(1);
    expect(await analytics.scan(seasonOne)).toMatchObject({ inserted: 0 });
    const flags = await analytics.flags(seasonOne);
    const flag = flags.find(
      (entry) =>
        entry.matchId === matchId &&
        entry.playerId === playerIds[0] &&
        entry.type === 'DISCONNECT_ABUSE',
    );
    expect(flag).toMatchObject({
      type: 'DISCONNECT_ABUSE',
      status: 'OPEN',
      evidence: { seasonId: seasonOne, matchIds: [matchId] },
    });
    const review = await analytics.review(
      flag!.id,
      'operator-test',
      'DISMISSED',
      'Connection outage confirmed',
    );
    expect(
      (
        await analytics.review(
          flag!.id,
          'operator-test',
          'DISMISSED',
          'Connection outage confirmed',
        )
      ).id,
    ).toBe(review.id);
    await analytics.scan(seasonOne);
    expect((await analytics.flags(seasonOne)).find((entry) => entry.id === flag!.id)).toMatchObject(
      {
        status: 'DISMISSED',
        reviews: [{ operatorId: 'operator-test', previousStatus: 'OPEN', nextStatus: 'DISMISSED' }],
      },
    );
    const report = await analytics.report(seasonOne);
    expect(report.completedMatches).toBeGreaterThanOrEqual(1);
    expect(report.disconnectCount).toBeGreaterThanOrEqual(3);
    expect(report.cards).toContainEqual(expect.objectContaining({ key: 'ranked-lethal@1.0.0' }));
    expect(report.classes).toContainEqual(expect.objectContaining({ key: 'SWORD' }));
    expect(report.decks.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain(playerIds[0]!);
  });

  it('settles a v1 match with its immutable policy after switching workers', async () => {
    const { matchId, initial, cardId } = await createRankedSession();
    const snapshots = await prisma.rankedMatchPlayer.findMany({ where: { matchId } });
    expect(Reflect.set(defaultRatingConfig.kValues, 'provisional', 80)).toBe(false);

    const replacementWorker = new PrismaPvpMatchPersistence(prisma);
    const replacementSession = new MatchSession({
      state: initial,
      definitions: [definition],
      onAction: (action) => replacementWorker.append(action),
    });
    const response = await replacementSession.receive(playerIds[0]!, {
      type: 'ACTION',
      requestId: 'replacement-worker',
      sequence: 0,
      action: { type: 'PLAY_CARD', playerId: playerIds[0]!, cardInstanceId: cardId },
    });
    expect(response.some((entry) => entry.type === 'STATE')).toBe(true);

    const winner = await prisma.ratingHistory.findUniqueOrThrow({
      where: { matchId_playerId: { matchId, playerId: playerIds[0]! } },
    });
    const start = snapshots.find((entry) => entry.playerId === playerIds[0])!;
    const opponent = snapshots.find((entry) => entry.playerId === playerIds[1])!;
    const ratingInput = {
      rating: start.ratingAtStart,
      opponentRating: opponent.ratingAtStart,
      completedGames: start.completedGamesAtStart,
      outcome: 'WIN' as const,
      damageDealt: winner.damageDealt,
      opponentInitialHp: winner.opponentInitialHp,
    };
    const changedConfig = {
      ...defaultRatingConfig,
      kValues: { ...defaultRatingConfig.kValues, provisional: 80 },
    };
    expect(winner.ratingConfigVersion).toBe('elo-damage-v1');
    expect(winner.delta).toBeCloseTo(calculateRatingChange(ratingInput, defaultRatingConfig).delta);
    expect(winner.delta).not.toBeCloseTo(calculateRatingChange(ratingInput, changedConfig).delta);
  });

  it('rejects a season transition with an open match and serializes duplicate workers', async () => {
    const { matchId, initial, session, cardId } = await createRankedSession();
    await expect(
      ranked.activateSeason({
        id: seasonTwo,
        startsAt: seasonTwoStartsAt,
        endsAt: seasonTwoEndsAt,
        initialRating: 1500,
        resetRetention: 0.5,
        at: new Date(seasonTwoStartsAt.getTime() + hourMs),
      }),
    ).rejects.toMatchObject({ code: 'SEASON_HAS_OPEN_MATCHES' });
    expect(await prisma.season.findUnique({ where: { id: seasonTwo } })).toBeNull();
    const secondWorker = new MatchSession({
      state: initial,
      definitions: [definition],
      onAction: (action) => persistence.append(action),
    });
    const message = {
      type: 'ACTION',
      requestId: 'same-match',
      sequence: 0,
      action: { type: 'PLAY_CARD', playerId: playerIds[0]!, cardInstanceId: cardId },
    };
    const responses = await Promise.all([
      session.receive(playerIds[0]!, message),
      secondWorker.receive(playerIds[0]!, message),
    ]);
    expect(
      responses.filter((response) => response.some((item) => item.type === 'STATE')),
    ).toHaveLength(1);
    expect(await prisma.ratingHistory.count({ where: { matchId } })).toBe(2);
  });

  it('soft resets rating into the next season without duplicating completed games', async () => {
    const prior = await prisma.playerSeasonRating.findMany({ where: { seasonId: seasonOne } });
    await expect(
      ranked.activateSeason({
        id: randomUUID(),
        startsAt: new Date(referenceTime),
        endsAt: new Date(seasonTwoStartsAt.getTime() + 12 * hourMs),
        initialRating: 1500,
        resetRetention: 0.5,
        at: new Date(referenceTime + hourMs),
      }),
    ).rejects.toMatchObject({ code: 'SEASON_OVERLAP' });
    await ranked.activateSeason({
      id: seasonTwo,
      startsAt: seasonTwoStartsAt,
      endsAt: seasonTwoEndsAt,
      initialRating: 1500,
      resetRetention: 0.5,
      at: new Date(seasonTwoStartsAt.getTime() + hourMs),
    });
    const next = await prisma.playerSeasonRating.findMany({ where: { seasonId: seasonTwo } });
    expect(next).toHaveLength(2);
    for (const rating of next) {
      const previous = prior.find((entry) => entry.playerId === rating.playerId)!;
      expect(rating.rating).toBeCloseTo(1500 + (previous.rating - 1500) * 0.5);
      expect(rating.completedGames).toBe(0);
    }
  });
});
