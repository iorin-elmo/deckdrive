import { rankDisplayConfig, rankProgress } from '@deck-drive/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export class RankedHistoryCursorError extends Error {
  constructor() {
    super('RANKED_HISTORY_CURSOR_NOT_FOUND');
  }
}

/** All queries are scoped to the authenticated player. */
export class PrismaRankedReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async profile(playerId: string) {
    const now = new Date();
    const season = await this.prisma.season.findFirst({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, startsAt: true, endsAt: true, initialRating: true },
    });
    if (season === null)
      return {
        season: null,
        rating: null,
        rank: null,
        rr: null,
        rrGoal: rankDisplayConfig.rrPerDivision,
      };
    const row = await this.prisma.playerSeasonRating.findUnique({
      where: { seasonId_playerId: { seasonId: season.id, playerId } },
      select: { rating: true, completedGames: true },
    });
    const rating = row?.rating ?? season.initialRating;
    const progress = rankProgress(rating);
    return {
      season: { id: season.id, startsAt: season.startsAt, endsAt: season.endsAt },
      rating,
      rank: { name: progress.name, division: progress.division },
      rr: progress.rr,
      rrGoal: rankDisplayConfig.rrPerDivision,
      completedGames: row?.completedGames ?? 0,
    };
  }

  async history(playerId: string, cursor?: string) {
    if (cursor !== undefined) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(cursor))
        throw new RankedHistoryCursorError();
      const ownedCursor = await this.prisma.ratingHistory.findFirst({
        where: { id: cursor, playerId },
        select: { id: true },
      });
      if (ownedCursor === null) throw new RankedHistoryCursorError();
    }
    const rows = await this.prisma.ratingHistory.findMany({
      where: { playerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        matchId: true,
        seasonId: true,
        outcome: true,
        ratingBefore: true,
        ratingAfter: true,
        delta: true,
        k: true,
        expectedScore: true,
        actualScore: true,
        damageRatio: true,
        ratingConfigVersion: true,
        createdAt: true,
      },
    });
    const items = rows.slice(0, 20);
    return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null };
  }
}
