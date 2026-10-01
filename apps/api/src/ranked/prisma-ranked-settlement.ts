import type { BattleState, PlayerId, Replay } from '@deck-drive/game-engine';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

import { sumHpDamageDealt } from './performance.js';
import { currentRatingPolicyVersion, ratingPolicyForVersion } from './rating-policy.js';
import { calculateRatingChange, softResetRating, type RatingInput } from './rating.js';

const seasonLockKey = 2026100102;

export interface ActivateSeasonInput {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly initialRating: number;
  readonly resetRetention: number;
  readonly at: Date;
}

export class RankedSettlementError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'RankedSettlementError';
  }
}

/** Owns season boundaries and the atomic rating portion of a PvP commit. */
export class PrismaRankedSettlement {
  constructor(private readonly prisma: PrismaClient) {}

  async activateSeason(input: ActivateSeasonInput): Promise<void> {
    validateSeason(input);
    await this.prisma.$transaction(async (transaction) => {
      await lockSeasonTransition(transaction);
      const existing = await transaction.season.findUnique({ where: { id: input.id } });
      if (existing !== null) {
        if (
          existing.status === 'ACTIVE' &&
          existing.startsAt.getTime() === input.startsAt.getTime() &&
          existing.endsAt.getTime() === input.endsAt.getTime() &&
          existing.initialRating === input.initialRating &&
          existing.resetRetention === input.resetRetention &&
          existing.ratingConfigVersion === currentRatingPolicyVersion
        )
          return;
        throw new RankedSettlementError('SEASON_ID_CONFLICT');
      }
      const current = await transaction.season.findFirst({ where: { status: 'ACTIVE' } });
      if (current !== null) {
        if (input.startsAt < current.endsAt) throw new RankedSettlementError('SEASON_OVERLAP');
        const openMatch = await transaction.rankedMatch.findFirst({
          where: { seasonId: current.id, match: { status: 'IN_PROGRESS' } },
          select: { matchId: true },
        });
        if (openMatch !== null) throw new RankedSettlementError('SEASON_HAS_OPEN_MATCHES');
        await transaction.season.update({ where: { id: current.id }, data: { status: 'CLOSED' } });
      }
      await transaction.season.create({
        data: {
          id: input.id,
          status: 'ACTIVE',
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          initialRating: input.initialRating,
          resetRetention: input.resetRetention,
          ratingConfigVersion: currentRatingPolicyVersion,
        },
      });
      if (current === null) return;
      const priorRatings = await transaction.playerSeasonRating.findMany({
        where: { seasonId: current.id },
        select: { playerId: true, rating: true },
      });
      for (let offset = 0; offset < priorRatings.length; offset += 500) {
        await transaction.playerSeasonRating.createMany({
          data: priorRatings.slice(offset, offset + 500).map((prior) => ({
            seasonId: input.id,
            playerId: prior.playerId,
            rating: softResetRating(prior.rating, {
              anchor: input.initialRating,
              retention: input.resetRetention,
            }),
            completedGames: 0,
            updatedAt: input.at,
          })),
        });
      }
    });
  }

  /** Called in the same transaction that inserts the ranked match and seats. */
  async captureMatchStart(
    transaction: Prisma.TransactionClient,
    state: BattleState,
    at: Date = new Date(),
  ): Promise<void> {
    await lockSeasonTransition(transaction);
    const season = await transaction.season.findFirst({
      where: { status: 'ACTIVE', startsAt: { lte: at }, endsAt: { gt: at } },
    });
    if (season === null) throw new RankedSettlementError('ACTIVE_SEASON_NOT_FOUND');
    if (ratingPolicyForVersion(season.ratingConfigVersion) === undefined)
      throw new RankedSettlementError('RATING_CONFIG_VERSION_MISMATCH');
    if (state.players.length !== 2 || state.players[0]?.id === state.players[1]?.id)
      throw new RankedSettlementError('INVALID_RANKED_PARTICIPANTS');
    const seats = await transaction.matchPlayer.findMany({
      where: { matchId: state.matchId },
      orderBy: { seat: 'asc' },
      select: { playerId: true },
    });
    if (
      seats.length !== 2 ||
      seats.some((seat, index) => seat.playerId !== state.players[index]?.id)
    )
      throw new RankedSettlementError('INVALID_RANKED_PARTICIPANTS');
    const snapshots = [];
    for (const [index, player] of state.players.entries()) {
      const rating = await transaction.playerSeasonRating.upsert({
        where: { seasonId_playerId: { seasonId: season.id, playerId: player.id } },
        create: { seasonId: season.id, playerId: player.id, rating: season.initialRating },
        update: {},
        select: { rating: true, completedGames: true },
      });
      snapshots.push({
        matchId: state.matchId,
        playerId: player.id,
        seat: index + 1,
        ratingAtStart: rating.rating,
        completedGamesAtStart: rating.completedGames,
      });
    }
    await transaction.rankedMatch.create({
      data: {
        matchId: state.matchId,
        seasonId: season.id,
        ratingConfigVersion: season.ratingConfigVersion,
      },
    });
    await transaction.rankedMatchPlayer.createMany({ data: snapshots });
  }

  /** The caller has just generated and verified this replay inside the match transaction. */
  async settleMatch(transaction: Prisma.TransactionClient, replay: Replay): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM matches WHERE id = ${replay.matchId} FOR UPDATE`;
    const ranked = await transaction.rankedMatch.findUnique({
      where: { matchId: replay.matchId },
      include: { players: { orderBy: { seat: 'asc' } } },
    });
    if (ranked === null || ranked.players.length !== 2)
      throw new RankedSettlementError('RANKED_SNAPSHOT_NOT_FOUND');
    const policy = ratingPolicyForVersion(ranked.ratingConfigVersion);
    if (policy === undefined) throw new RankedSettlementError('RATING_CONFIG_VERSION_MISMATCH');
    const existing = await transaction.ratingHistory.findMany({
      where: { matchId: replay.matchId },
      select: { playerId: true },
    });
    if (existing.length === 2) {
      if (
        existing.every((entry) =>
          ranked.players.some((player) => player.playerId === entry.playerId),
        )
      )
        return;
      throw new RankedSettlementError('RATING_HISTORY_CORRUPT');
    }
    if (existing.length !== 0) throw new RankedSettlementError('RATING_HISTORY_CORRUPT');
    const result = replay.events.at(-1);
    if (
      replay.finalState.phase !== 'MATCH_END' ||
      result?.type !== 'MATCH_FINISHED' ||
      replay.initialState.players.length !== 2 ||
      ranked.players.some(
        (player, index) => replay.initialState.players[index]?.id !== player.playerId,
      )
    )
      throw new RankedSettlementError('INVALID_RANKED_REPLAY');

    // Lock in the same order for every match to avoid deadlocks and lost updates.
    for (const playerId of ranked.players.map((player) => player.playerId).sort()) {
      const locked = await transaction.$queryRaw<readonly { player_id: string }[]>`
        SELECT player_id FROM player_season_ratings
        WHERE season_id = ${ranked.seasonId}::uuid AND player_id = ${playerId}::uuid
        FOR UPDATE`;
      if (locked.length !== 1) throw new RankedSettlementError('PLAYER_RATING_NOT_FOUND');
    }
    for (const [index, snapshot] of ranked.players.entries()) {
      const opponent = ranked.players[1 - index]!;
      const opponentInitial = replay.initialState.players[1 - index]!;
      const outcome = outcomeFor(result.result, snapshot.playerId);
      const damageDealt = sumHpDamageDealt(
        replay.events,
        snapshot.playerId as PlayerId,
        opponent.playerId as PlayerId,
      );
      const input: RatingInput = {
        rating: snapshot.ratingAtStart,
        opponentRating: opponent.ratingAtStart,
        completedGames: snapshot.completedGamesAtStart,
        outcome,
        damageDealt,
        opponentInitialHp: opponentInitial.hp,
      };
      const change = calculateRatingChange(input, policy.config);
      const before = await transaction.playerSeasonRating.findUniqueOrThrow({
        where: {
          seasonId_playerId: { seasonId: ranked.seasonId, playerId: snapshot.playerId },
        },
      });
      const updated = await transaction.playerSeasonRating.update({
        where: {
          seasonId_playerId: { seasonId: ranked.seasonId, playerId: snapshot.playerId },
        },
        data: { rating: { increment: change.delta }, completedGames: { increment: 1 } },
      });
      await transaction.ratingHistory.create({
        data: {
          matchId: replay.matchId,
          seasonId: ranked.seasonId,
          playerId: snapshot.playerId,
          opponentId: opponent.playerId,
          outcome,
          ratingBefore: before.rating,
          ratingAfter: updated.rating,
          ratingAtStart: snapshot.ratingAtStart,
          opponentRatingAtStart: opponent.ratingAtStart,
          delta: change.delta,
          k: change.k,
          expectedScore: change.expectedScore,
          actualScore: change.actualScore,
          damageRatio: change.damageRatio,
          damageDealt,
          opponentInitialHp: opponentInitial.hp,
          ratingConfigVersion: ranked.ratingConfigVersion,
        },
      });
    }
  }
}

async function lockSeasonTransition(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${seasonLockKey})::text`;
}

function outcomeFor(
  result: Extract<Replay['events'][number], { readonly type: 'MATCH_FINISHED' }>['result'],
  playerId: string,
): RatingInput['outcome'] {
  return result.status === 'DRAW' ? 'DRAW' : result.winnerId === playerId ? 'WIN' : 'LOSS';
}

function validateSeason(input: ActivateSeasonInput): void {
  if (
    !Number.isFinite(input.startsAt.getTime()) ||
    !Number.isFinite(input.endsAt.getTime()) ||
    !Number.isFinite(input.at.getTime()) ||
    input.startsAt >= input.endsAt ||
    input.at < input.startsAt ||
    input.at >= input.endsAt ||
    !Number.isFinite(input.initialRating) ||
    !Number.isFinite(input.resetRetention) ||
    input.resetRetention < 0 ||
    input.resetRetention > 1
  )
    throw new RangeError('Invalid season settings.');
}
