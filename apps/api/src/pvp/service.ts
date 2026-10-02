import { randomUUID } from 'node:crypto';

import {
  createInitialBattleState,
  recordReplay,
  SeededRandom,
  type BattleState,
  type CardDefinition,
  type CardInstance,
  type CardDefinitionSource,
  type GameAction,
  type GameEvent,
  type MatchId,
  type PlayerId,
} from '@deck-drive/game-engine';
import type { IncomingMessage } from 'node:http';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { deckSize } from '../decks/deck-validation.js';
import { rankedSeasonLockKey } from '../ranked/prisma-ranked-settlement.js';
import { PrismaPvpMatchPersistence, PvpConcurrentMatchError } from './persistence.js';
import {
  PvpLobby,
  type LobbyPlayer,
  type PrivateMatchResult,
  type RestoredPvpMatch,
} from './lobby.js';
import {
  MatchSession,
  type AcceptedAction,
  type MatchSnapshot,
  type RestoredRequest,
} from './session.js';

const pvpStatusRetentionMs = 5 * 60_000;
const rankedQueueWaitMs = 15 * 60_000;
const rankedQueueLockKey = 2026100103;

class PvpRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  consume(key: string, maximum: number, windowMs: number): void {
    const now = Date.now();
    const attempts = (this.attempts.get(key) ?? []).filter((attempt) => now - attempt < windowMs);
    if (attempts.length >= maximum) throw new PvpRequestError('RATE_LIMITED');
    attempts.push(now);
    this.attempts.set(key, attempts);
  }
}

interface PvpDeck {
  readonly cardDataVersion: string;
  readonly cards: readonly CardInstance[];
  readonly definitions: readonly CardDefinition[];
  readonly snapshot: unknown;
}

type CasualMatchResult =
  | { readonly status: 'QUEUED'; readonly queueId: string }
  | { readonly status: 'MATCHED'; readonly queueId: string; readonly matchId: string };

type PrivateCreateResult = PrivateMatchResult<PvpDeck>;

export type PvpAuthenticator = (
  request: IncomingMessage,
) => Promise<PlayerId | null> | PlayerId | null;

/** API-facing orchestration for validated player decks and PvP sessions. */
export class PvpMatchService {
  private readonly persistence: PrismaPvpMatchPersistence;
  private readonly lobby: PvpLobby<PvpDeck>;
  private readonly loading = new Map<string, Promise<MatchSession | undefined>>();
  private readonly casualInFlight = new Map<string, Promise<CasualMatchResult>>();
  private readonly privateCreateRequests = new Map<
    string,
    {
      readonly deckId: string;
      readonly operation: Promise<PrivateCreateResult>;
      readonly expiresAt: number;
    }
  >();
  private readonly presenceWrites = new Map<string, Promise<void>>();
  private readonly matchmakingRateLimiter = new PvpRateLimiter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly authenticator: PvpAuthenticator = developmentAuthenticator,
  ) {
    this.persistence = new PrismaPvpMatchPersistence(prisma);
    this.lobby = new PvpLobby({
      createState: ({ mode, matchId, players }) => createState(mode, matchId, players),
      canPair: (candidate, incoming) =>
        candidate.deck.cardDataVersion === incoming.deck.cardDataVersion,
      createSession: ({ mode, matchId, players }) => ({
        definitions: mergeDefinitions(players.flatMap((player) => player.deck.definitions)),
        ratedAbandonment: mode === 'RANKED',
        onPlayerConnect: (playerId) => this.queuePresenceWrite(matchId, playerId, null),
        onPlayerDisconnect: (playerId, disconnectedAt) =>
          this.queuePresenceWrite(matchId, playerId, disconnectedAt),
      }),
      session: {
        onAction: (accepted) => this.persistAction(accepted),
        onAbandoned: (matchId) => this.persistence.abandon(matchId),
      },
      statusRetentionMs: pvpStatusRetentionMs,
    });
  }

  async enqueueCasual(playerId: string, deckId: string) {
    const inFlight = this.casualInFlight.get(playerId);
    if (inFlight !== undefined) return inFlight;
    const operation = this.enqueueCasualLocked(playerId, deckId);
    this.casualInFlight.set(playerId, operation);
    try {
      return await operation;
    } finally {
      if (this.casualInFlight.get(playerId) === operation) this.casualInFlight.delete(playerId);
    }
  }

  async enqueueRanked(playerId: string, deckId: string) {
    await this.consumeRankedEnqueueRateLimit(playerId);
    let createdSession: MatchSession | undefined;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${rankedQueueLockKey})::text`;
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${rankedSeasonLockKey})::text`;
        const now = new Date();
        await transaction.rankedQueueEntry.updateMany({
          where: { status: 'WAITING', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        });
        const activeMatch = await transaction.match.findFirst({
          where: { mode: 'RANKED', status: 'IN_PROGRESS', players: { some: { playerId } } },
          select: { id: true },
        });
        if (activeMatch !== null) {
          const entry = await transaction.rankedQueueEntry.findFirst({
            where: { playerId, matchId: activeMatch.id },
            select: { id: true },
          });
          if (entry === null) throw new PvpRequestError('RANKED_MATCH_CONFLICT');
          return { status: 'MATCHED' as const, queueId: entry.id, matchId: activeMatch.id };
        }
        const season = await transaction.season.findFirst({
          where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
          select: { id: true, initialRating: true },
        });
        if (season === null) throw new PvpRequestError('ACTIVE_SEASON_NOT_FOUND');
        await transaction.rankedQueueEntry.updateMany({
          where: { status: 'WAITING', seasonId: { not: season.id } },
          data: { status: 'EXPIRED' },
        });
        const existing = await transaction.rankedQueueEntry.findFirst({
          where: { playerId, status: 'WAITING' },
        });
        if (existing !== null) {
          if (existing.deckId !== deckId || existing.seasonId !== season.id)
            throw new PvpRequestError('REQUEST_CONFLICT');
        }
        const rating =
          existing === null
            ? await transaction.playerSeasonRating.findUnique({
                where: { seasonId_playerId: { seasonId: season.id, playerId } },
                select: { rating: true },
              })
            : null;
        const playerRating = existing?.rating ?? rating?.rating ?? season.initialRating;
        const queuedPlayer: LobbyPlayer<PvpDeck> =
          existing === null
            ? await this.loadPlayerDeck(playerId, deckId, transaction)
            : { playerId: playerId as PlayerId, deck: existing.deckData as unknown as PvpDeck };
        const candidates = await transaction.rankedQueueEntry.findMany({
          where: {
            status: 'WAITING',
            seasonId: season.id,
            cardDataVersion: queuedPlayer.deck.cardDataVersion,
            playerId: { not: playerId },
            rating: { gte: playerRating - 500, lte: playerRating + 500 },
          },
          orderBy: { createdAt: 'asc' },
        });
        const opponent = candidates
          .filter(
            (candidate) =>
              Math.abs(candidate.rating - playerRating) <=
              Math.min(
                500,
                100 +
                  50 *
                    Math.floor(
                      (now.getTime() -
                        Math.min(
                          candidate.createdAt.getTime(),
                          existing?.createdAt.getTime() ?? now.getTime(),
                        )) /
                        30_000,
                    ),
              ),
          )
          .sort(
            (left, right) =>
              Math.abs(left.rating - playerRating) - Math.abs(right.rating - playerRating) ||
              left.createdAt.getTime() - right.createdAt.getTime(),
          )[0];
        const queueId = existing?.id ?? randomUUID();
        const expiresAt = new Date(now.getTime() + rankedQueueWaitMs);
        if (opponent === undefined) {
          if (existing === null)
            await transaction.rankedQueueEntry.create({
              data: {
                id: queueId,
                playerId,
                seasonId: season.id,
                deckId,
                deckData: asInputJson(queuedPlayer.deck),
                cardDataVersion: queuedPlayer.deck.cardDataVersion,
                rating: playerRating,
                expiresAt,
              },
            });
          return { status: 'QUEUED' as const, queueId };
        }
        const waitingPlayer: LobbyPlayer<PvpDeck> = {
          playerId: opponent.playerId as PlayerId,
          deck: opponent.deckData as unknown as PvpDeck,
        };
        const paired = this.lobby.createRanked(waitingPlayer, queuedPlayer);
        createdSession = paired.session;
        await this.persistence.createInTransaction(
          transaction,
          paired.session.currentState,
          [
            { playerId: waitingPlayer.playerId, deckSnapshot: waitingPlayer.deck.snapshot },
            { playerId: queuedPlayer.playerId, deckSnapshot: queuedPlayer.deck.snapshot },
          ],
          { mode: 'RANKED', queueId: opponent.id },
        );
        const reservedOpponent = await transaction.rankedQueueEntry.updateMany({
          where: { id: opponent.id, status: 'WAITING' },
          data: { status: 'MATCHED', matchId: paired.matchId },
        });
        if (reservedOpponent.count !== 1) throw new PvpRequestError('QUEUE_NOT_FOUND');
        if (existing === null)
          await transaction.rankedQueueEntry.create({
            data: {
              id: queueId,
              playerId,
              seasonId: season.id,
              deckId,
              deckData: asInputJson(queuedPlayer.deck),
              cardDataVersion: queuedPlayer.deck.cardDataVersion,
              rating: playerRating,
              status: 'MATCHED',
              matchId: paired.matchId,
              expiresAt,
            },
          });
        else {
          const reservedPlayer = await transaction.rankedQueueEntry.updateMany({
            where: { id: queueId, status: 'WAITING' },
            data: { status: 'MATCHED', matchId: paired.matchId },
          });
          if (reservedPlayer.count !== 1) throw new PvpRequestError('QUEUE_NOT_FOUND');
        }
        return { status: 'MATCHED' as const, queueId, matchId: paired.matchId };
      });
    } catch (error) {
      if (createdSession !== undefined) this.lobby.remove(createdSession.matchId);
      throw error;
    }
  }

  private async consumeRankedEnqueueRateLimit(playerId: string): Promise<void> {
    // Commit the attempt before matchmaking so even a failed enqueue consumes
    // a slot, as it did with the previous process-local limiter.
    const allowed = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${rankedQueueLockKey})::text`;
      const now = (await transaction.$queryRaw<{ now: Date }[]>`
        SELECT clock_timestamp() AS now
      `)[0]!.now;
      const row = await transaction.rankedEnqueueRateLimit.findUnique({
        where: { playerId },
        select: { attemptedAt: true },
      });
      const attempts = (row?.attemptedAt ?? []).filter(
        (attempt) => attempt.getTime() > now.getTime() - 10_000,
      );
      if (attempts.length >= 10) return false;
      await transaction.rankedEnqueueRateLimit.upsert({
        where: { playerId },
        create: { playerId, attemptedAt: [...attempts, now] },
        update: { attemptedAt: [...attempts, now] },
      });
      return true;
    });
    if (!allowed) throw new PvpRequestError('RATE_LIMITED');
  }

  async rankedStatus(
    playerId: string,
    queueId: string,
  ): Promise<{
    readonly status: 'WAITING' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';
    readonly queueId: string;
    readonly matchId?: string;
  }> {
    if (!isUuid(queueId)) throw new PvpRequestError('QUEUE_NOT_FOUND');
    const entry = await this.prisma.rankedQueueEntry.findFirst({
      where: { id: queueId, playerId },
      select: {
        status: true,
        matchId: true,
        expiresAt: true,
        season: { select: { status: true, startsAt: true, endsAt: true } },
      },
    });
    if (entry === null) throw new PvpRequestError('QUEUE_NOT_FOUND');
    const now = new Date();
    if (
      entry.status === 'WAITING' &&
      (entry.expiresAt <= now ||
        entry.season.status !== 'ACTIVE' ||
        entry.season.startsAt > now ||
        entry.season.endsAt <= now)
    ) {
      const expired = await this.prisma.rankedQueueEntry.updateMany({
        where: { id: queueId, status: 'WAITING' },
        data: { status: 'EXPIRED' },
      });
      if (expired.count === 0) return this.rankedStatus(playerId, queueId);
      return { status: 'EXPIRED' as const, queueId };
    }
    return entry.status === 'MATCHED' && entry.matchId !== null
      ? { status: 'MATCHED' as const, queueId, matchId: entry.matchId }
      : { status: entry.status, queueId };
  }

  async cancelRanked(playerId: string, queueId: string) {
    if (!isUuid(queueId)) throw new PvpRequestError('QUEUE_NOT_FOUND');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${rankedQueueLockKey})::text`;
      const entry = await transaction.rankedQueueEntry.findFirst({
        where: { id: queueId, playerId },
        select: { status: true, matchId: true },
      });
      if (entry === null) throw new PvpRequestError('QUEUE_NOT_FOUND');
      if (entry.status === 'WAITING') {
        await transaction.rankedQueueEntry.update({
          where: { id: queueId },
          data: { status: 'CANCELLED' },
        });
        return { status: 'CANCELLED' as const, queueId };
      }
      return entry.status === 'MATCHED' && entry.matchId !== null
        ? { status: 'MATCHED' as const, queueId, matchId: entry.matchId }
        : { status: entry.status, queueId };
    });
  }

  async forfeitRanked(playerId: string, matchId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, mode: 'RANKED', players: { some: { playerId } } },
      select: { status: true },
    });
    if (match === null) throw new PvpRequestError('MATCH_NOT_FOUND');
    if (match.status !== 'IN_PROGRESS') return { status: match.status };
    const session = await this.find(matchId);
    if (session === undefined) throw new PvpRequestError('MATCH_NOT_FOUND');
    const responses = await session.forfeit(playerId as PlayerId);
    if (responses.some((message) => message.type === 'ERROR'))
      throw new PvpRequestError('RANKED_FORFEIT_FAILED');
    return { status: 'COMPLETED' as const };
  }

  private async enqueueCasualLocked(playerId: string, deckId: string) {
    this.matchmakingRateLimiter.consume(`${playerId}:casual`, 10, 10_000);
    const existing = this.lobby.casualStatusForPlayer(playerId as PlayerId);
    if (existing?.status === 'QUEUED') return existing;
    if (existing?.status === 'MATCHED' && this.lobby.find(existing.matchId)?.isActive)
      return existing;
    const persisted = await this.findPersistedCasualMatch(playerId, existing);
    if (persisted !== undefined) return persisted;
    const activeMatch = await this.prisma.match.findFirst({
      where: { mode: 'CASUAL', status: 'IN_PROGRESS', players: { some: { playerId } } },
      select: { id: true, queueId: true },
    });
    if (activeMatch?.queueId !== null && activeMatch?.queueId !== undefined)
      return { status: 'MATCHED' as const, queueId: activeMatch.queueId, matchId: activeMatch.id };
    const player = await this.loadPlayerDeck(playerId, deckId);
    const result = this.lobby.enqueueCasual(player);
    if (result.status === 'QUEUED') return result;
    try {
      await this.persistNewMatch(result.session, result.players, {
        mode: 'CASUAL',
        queueId: result.queueId,
      });
      this.lobby.markCasualMatched(result.queueId, result.matchId);
      this.lobby.setCasualParticipants(
        result.queueId,
        result.players.map((entry) => entry.playerId),
      );
      this.lobby.commitCasual(result.queueId);
    } catch (error) {
      this.lobby.releaseCasual(result.queueId);
      this.lobby.remove(result.matchId);
      throw error;
    }
    return result;
  }

  async createPrivate(playerId: string, deckId: string, requestId?: string) {
    this.prunePrivateCreateRequests();
    const requestKey = requestId === undefined ? undefined : `${playerId}:${requestId}`;
    if (requestKey !== undefined) {
      const existing = this.privateCreateRequests.get(requestKey);
      if (existing !== undefined) {
        if (existing.deckId !== deckId) throw new PvpRequestError('REQUEST_CONFLICT');
        return existing.operation;
      }
    }
    this.matchmakingRateLimiter.consume(`${playerId}:private-create`, 5, 60_000);
    const operation = this.createPrivateLocked(playerId, deckId);
    if (requestKey !== undefined)
      this.privateCreateRequests.set(requestKey, {
        deckId,
        operation,
        expiresAt: Date.now() + pvpStatusRetentionMs,
      });
    try {
      return await operation;
    } catch (error) {
      if (
        requestKey !== undefined &&
        this.privateCreateRequests.get(requestKey)?.operation === operation
      )
        this.privateCreateRequests.delete(requestKey);
      throw error;
    }
  }

  private async createPrivateLocked(
    playerId: string,
    deckId: string,
  ): Promise<PrivateCreateResult> {
    try {
      return this.lobby.createPrivate(await this.loadPlayerDeck(playerId, deckId));
    } catch (error) {
      if (error instanceof Error && error.message === 'PRIVATE_INVITE_LIMIT')
        throw new PvpRequestError('PRIVATE_INVITE_LIMIT');
      throw error;
    }
  }

  async joinPrivate(playerId: string, inviteCode: string, deckId: string) {
    this.matchmakingRateLimiter.consume(`${playerId}:private-join`, 20, 60_000);
    const normalizedCode = inviteCode.trim().toUpperCase();
    const existing = await this.findPersistedPrivateMatch(playerId, normalizedCode);
    if (existing !== undefined) return existing;
    const guest = await this.loadPlayerDeck(playerId, deckId);
    let result;
    try {
      result = this.lobby.joinPrivate(inviteCode, guest);
    } catch (error) {
      if (error instanceof Error && error.message === 'PRIVATE_INVITE_NOT_FOUND')
        throw new PvpRequestError('PRIVATE_INVITE_NOT_FOUND');
      if (error instanceof Error && error.message === 'PRIVATE_INVITE_SELF_JOIN')
        throw new PvpRequestError('PRIVATE_INVITE_SELF_JOIN');
      throw error;
    }
    try {
      await this.persistNewMatch(result.session, result.players, {
        mode: 'PRIVATE',
        inviteCode: result.inviteCode,
      });
      this.lobby.markPrivateMatched(result.inviteCode, result.matchId);
      this.lobby.setPrivateParticipants(
        result.inviteCode,
        result.players.map((entry) => entry.playerId),
      );
      this.lobby.commitPrivate(result.inviteCode);
    } catch (error) {
      this.lobby.releasePrivate(result.inviteCode);
      this.lobby.remove(result.matchId);
      throw error;
    }
    return result;
  }

  find(matchId: string): Promise<MatchSession | undefined> {
    const cached = this.lobby.find(matchId);
    if (cached !== undefined) return Promise.resolve(cached);
    const loading = this.loading.get(matchId);
    if (loading !== undefined) return loading;
    const promise = this.restore(matchId).finally(() => this.loading.delete(matchId));
    this.loading.set(matchId, promise);
    return promise;
  }

  sessions(): readonly MatchSession[] {
    return this.lobby.sessions().filter((session) => session.isActive);
  }

  async casualStatus(playerId: string, queueId: string) {
    const status = this.lobby.casualStatus(queueId, playerId as PlayerId);
    if (status !== undefined) return status;
    const persisted = await this.prisma.match.findFirst({
      where: {
        queueId,
        mode: 'CASUAL',
        players: { some: { playerId } },
      },
      select: { id: true, createdAt: true },
    });
    if (persisted === null || Date.now() - persisted.createdAt.getTime() > pvpStatusRetentionMs)
      throw new PvpRequestError('QUEUE_NOT_FOUND');
    return { status: 'MATCHED' as const, queueId, matchId: persisted.id };
  }

  async privateStatus(playerId: string, inviteCode: string) {
    const status = this.lobby.privateStatus(inviteCode, playerId as PlayerId);
    if (status !== undefined) return status;
    const normalizedCode = inviteCode.trim().toUpperCase();
    const persisted = await this.prisma.match.findFirst({
      where: {
        inviteCode: normalizedCode,
        mode: 'PRIVATE',
        players: { some: { playerId } },
      },
      select: { id: true, createdAt: true },
    });
    if (persisted === null || Date.now() - persisted.createdAt.getTime() > pvpStatusRetentionMs)
      throw new PvpRequestError('PRIVATE_STATUS_NOT_FOUND');
    return { status: 'MATCHED' as const, inviteCode: normalizedCode, matchId: persisted.id };
  }

  async restoreActive(): Promise<void> {
    const matches = await this.prisma.match.findMany({
      where: { status: 'IN_PROGRESS', mode: { in: ['CASUAL', 'PRIVATE', 'RANKED'] } },
      select: { id: true },
    });
    await Promise.all(matches.map((match) => this.find(match.id)));
  }

  authenticate(request: IncomingMessage): Promise<PlayerId | null> | PlayerId | null {
    return this.authenticator(request);
  }

  private async loadPlayerDeck(
    playerId: string,
    deckId: string,
    database: PrismaClient | Prisma.TransactionClient = this.prisma,
  ): Promise<LobbyPlayer<PvpDeck>> {
    if (!isUuid(deckId)) throw new PvpRequestError('DECK_NOT_FOUND');
    const deck = await database.deck.findFirst({
      where: { id: deckId, playerId },
      include: { cards: { orderBy: { position: 'asc' }, include: { cardVersion: true } } },
    });
    if (deck === null) throw new PvpRequestError('DECK_NOT_FOUND');
    const cards = deck.cards.flatMap((deckCard) => {
      const definition = toDefinition(deckCard.cardVersion.definition);
      return Array.from({ length: deckCard.quantity }, (_, index) => ({
        id: `${playerId}-${String(deckCard.position)}-${String(index)}` as CardInstance['id'],
        definitionId: definition.id,
      }));
    });
    const definitions = deck.cards.map((deckCard) => toDefinition(deckCard.cardVersion.definition));
    if (cards.length !== deckSize) throw new PvpRequestError('INVALID_DECK');
    return {
      playerId: playerId as PlayerId,
      deck: {
        cardDataVersion: deck.cardDataVersion,
        cards,
        definitions,
        snapshot: deck,
      },
    };
  }

  private async restore(matchId: string): Promise<MatchSession | undefined> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          select: {
            playerId: true,
            seat: true,
            deckSnapshot: true,
            disconnectedAt: true,
            connectedOnce: true,
          },
        },
        actions: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { sequence: 'asc' } },
        snapshots: { orderBy: { actionIndex: 'desc' }, take: 1 },
      },
    });
    if (
      match === null ||
      (match.status !== 'IN_PROGRESS' && match.status !== 'COMPLETED') ||
      match.players.length !== 2
    )
      return undefined;
    // No socket survives an API restart. Rebase the grace period for every
    // participant, including a player whose last presence write failed before
    // the previous process died. Never trust an old connected/disconnected row
    // as evidence of a live socket in this process.
    const restoredAt = Date.now();
    if (match.status === 'IN_PROGRESS')
      await this.prisma.matchPlayer.updateMany({
        where: { matchId },
        data: { disconnectedAt: new Date(restoredAt) },
      });
    const definitions = definitionsFromDeckSnapshots(match.players);
    const initialState = match.initialState as unknown as BattleState;
    const actions = match.actions.map((entry) => entry.action as unknown as GameAction);
    const replay = recordReplay(initialState, actions, definitions);
    if (!replay.ok) return undefined;
    const events = match.events.map((entry) => entry.event as unknown as GameEvent);
    const requests: RestoredRequest[] = match.actions.flatMap((entry) => {
      if (
        entry.playerId === null ||
        entry.requestId === null ||
        entry.response === null ||
        !Array.isArray(entry.response)
      )
        return [];
      return [
        {
          playerId: entry.playerId as PlayerId,
          requestId: entry.requestId,
          source: entry.source,
          // MatchAction.sequence is the post-action cursor; clients submit the
          // cursor immediately before that action.
          sequence: Math.max(0, entry.sequence - 1),
          action: entry.action as unknown as GameAction,
          messages: entry.response as unknown as RestoredRequest['messages'],
          ...(entry.timeoutStreak === null ? {} : { timeoutStreak: entry.timeoutStreak }),
        },
      ];
    });
    const snapshot = match.snapshots[0];
    const snapshots: MatchSnapshot[] =
      snapshot?.actionIndex === null || snapshot === undefined
        ? []
        : [
            {
              actionIndex: snapshot.actionIndex,
              eventSequence: snapshot.eventSequence,
              state: {
                ...(snapshot.state as object),
                events: events.filter((event) => event.sequence <= snapshot.eventSequence),
              } as unknown as BattleState,
            },
          ];
    const turnStartedAt =
      [...match.actions]
        .reverse()
        .find(
          (entry) =>
            isRecord(entry.action) && (entry.action as Record<string, unknown>).type === 'END_TURN',
        )?.createdAt ?? match.createdAt;
    const session = new MatchSession({
      state: (match.finalState as unknown as BattleState | null) ?? replay.replay.finalState,
      initialState,
      definitions,
      ratedAbandonment: match.mode === 'RANKED',
      history: {
        actions,
        events,
        snapshots,
        turnStartedAt: turnStartedAt.getTime(),
        requests,
        disconnectedAt: match.players.map((player) => ({
          playerId: player.playerId as PlayerId,
          at: restoredAt,
        })),
        connectedPlayers: match.players
          .filter((player) => player.connectedOnce)
          .map((player) => player.playerId as PlayerId),
      },
      onAction: async (accepted) => {
        await this.persistAction(accepted);
        if (accepted.state.phase === 'MATCH_END') this.lobby.remove(accepted.matchId);
      },
      onAbandoned: async (abandonedMatchId) => {
        await this.persistence.abandon(abandonedMatchId);
        this.lobby.remove(abandonedMatchId);
      },
      onPlayerConnect: (playerId) => this.queuePresenceWrite(matchId, playerId, null),
      onPlayerDisconnect: (playerId, disconnectedAt) =>
        this.queuePresenceWrite(matchId, playerId, disconnectedAt),
    });
    const playerIds = match.players
      .sort((left, right) => left.seat - right.seat)
      .map((player) => player.playerId as PlayerId) as [PlayerId, PlayerId];
    const metadata: RestoredPvpMatch | undefined =
      match.mode === 'CASUAL' && match.queueId !== null
        ? { mode: 'CASUAL', queueId: match.queueId, playerIds }
        : match.mode === 'PRIVATE' && match.inviteCode !== null
          ? { mode: 'PRIVATE', inviteCode: match.inviteCode, playerIds }
          : undefined;
    this.lobby.restore(session, metadata);
    return session;
  }

  private async persistNewMatch(
    session: MatchSession,
    players: readonly [LobbyPlayer<PvpDeck>, LobbyPlayer<PvpDeck>],
    metadata: {
      readonly mode: 'CASUAL' | 'PRIVATE' | 'RANKED';
      readonly queueId?: string;
      readonly inviteCode?: string;
    } = {
      mode: 'CASUAL',
    },
  ): Promise<void> {
    const state = session.currentState;
    await this.persistence.create(
      state,
      [
        { playerId: players[0].playerId, deckSnapshot: players[0].deck.snapshot },
        { playerId: players[1].playerId, deckSnapshot: players[1].deck.snapshot },
      ],
      metadata,
    );
  }

  private async persistAction(accepted: AcceptedAction): Promise<void> {
    try {
      await this.persistence.append(accepted);
    } catch (error) {
      if (error instanceof PvpConcurrentMatchError) await this.restore(accepted.matchId);
      throw error;
    }
  }

  private prunePrivateCreateRequests(): void {
    const now = Date.now();
    for (const [key, request] of this.privateCreateRequests)
      if (request.expiresAt <= now) this.privateCreateRequests.delete(key);
  }

  private queuePresenceWrite(
    matchId: string,
    playerId: PlayerId,
    disconnectedAt: number | null,
  ): void {
    const key = `${matchId}:${playerId}`;
    const previous = this.presenceWrites.get(key) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(() => this.writePresenceWithRetry(matchId, playerId, disconnectedAt));
    this.presenceWrites.set(key, operation);
    void operation
      .catch(() => undefined)
      .finally(() => {
        if (this.presenceWrites.get(key) === operation) this.presenceWrites.delete(key);
      });
  }

  private async writePresenceWithRetry(
    matchId: string,
    playerId: PlayerId,
    disconnectedAt: number | null,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.persistence.setPlayerDisconnected(matchId, playerId, disconnectedAt);
        return;
      } catch (error) {
        if (attempt === 2)
          console.error('PvP presence persistence failed; retrying until recovery', {
            matchId,
            playerId,
            error,
          });
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(30_000, 250 * 2 ** Math.min(attempt, 7))),
        );
      }
    }
  }

  private async findPersistedCasualMatch(
    playerId: string,
    status: ReturnType<PvpLobby<PvpDeck>['casualStatusForPlayer']>,
  ) {
    if (status?.status !== 'MATCHED') return undefined;
    const match = await this.prisma.match.findFirst({
      where: { id: status.matchId, mode: 'CASUAL', players: { some: { playerId } } },
      select: { id: true, status: true },
    });
    if (match === null || match.status !== 'IN_PROGRESS') return undefined;
    return { status: 'MATCHED' as const, queueId: status.queueId, matchId: match.id };
  }

  private async findPersistedPrivateMatch(playerId: string, inviteCode: string) {
    const match = await this.prisma.match.findFirst({
      where: {
        inviteCode,
        mode: 'PRIVATE',
        players: { some: { playerId, seat: 2 } },
      },
      select: { id: true },
    });
    return match === null
      ? undefined
      : { status: 'MATCHED' as const, inviteCode, matchId: match.id };
  }
}

export class PvpRequestError extends Error {
  constructor(
    readonly code:
      | 'DECK_NOT_FOUND'
      | 'INVALID_DECK'
      | 'PRIVATE_INVITE_NOT_FOUND'
      | 'PRIVATE_INVITE_SELF_JOIN'
      | 'QUEUE_NOT_FOUND'
      | 'PRIVATE_STATUS_NOT_FOUND'
      | 'PRIVATE_INVITE_LIMIT'
      | 'REQUEST_CONFLICT'
      | 'RANKED_MATCH_CONFLICT'
      | 'ACTIVE_SEASON_NOT_FOUND'
      | 'MATCH_NOT_FOUND'
      | 'RANKED_FORFEIT_FAILED'
      | 'RATE_LIMITED',
  ) {
    super(code);
    this.name = 'PvpRequestError';
  }
}

function createState(
  mode: 'CASUAL' | 'PRIVATE' | 'RANKED',
  matchId: MatchId,
  players: readonly [LobbyPlayer<PvpDeck>, LobbyPlayer<PvpDeck>],
) {
  if (players[0].deck.cardDataVersion !== players[1].deck.cardDataVersion)
    throw new PvpRequestError('INVALID_DECK');
  const seed = randomUUID();
  return createInitialBattleState({
    matchId,
    engineVersion: mode === 'RANKED' ? '1.1.0' : '1.0.0',
    rulesVersion: mode === 'RANKED' ? '1.1.0' : '1.0.0',
    cardDataVersion: players[0].deck.cardDataVersion,
    seed,
    initialDrawCount: 5,
    turnDrawCount: 1,
    players: players.map((player) => ({
      id: player.playerId,
      drawPile: shuffleDeck(player.deck.cards, `${seed}:${player.playerId}`),
    })),
  });
}

function shuffleDeck(cards: readonly CardInstance[], seed: string): readonly CardInstance[] {
  const shuffled = [...cards];
  const random = new SeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function mergeDefinitions(definitions: readonly CardDefinition[]): CardDefinitionSource {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return [...byId.values()];
}

function definitionsFromDeckSnapshots(
  players: readonly { readonly deckSnapshot: unknown }[],
): readonly CardDefinition[] {
  const definitions = new Map<string, CardDefinition>();
  for (const player of players) {
    if (!isRecord(player.deckSnapshot) || !Array.isArray(player.deckSnapshot.cards)) continue;
    for (const card of player.deckSnapshot.cards) {
      if (!isRecord(card) || !isRecord(card.cardVersion)) continue;
      const definition = toDefinition(card.cardVersion.definition);
      definitions.set(definition.id, definition);
    }
  }
  if (definitions.size === 0) throw new PvpRequestError('INVALID_DECK');
  return [...definitions.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function developmentAuthenticator(request: IncomingMessage): PlayerId | null {
  const playerId = request.headers['x-deckdrive-player-id'];
  return typeof playerId === 'string' && playerId.trim().length > 0 ? (playerId as PlayerId) : null;
}

function toDefinition(value: unknown): CardDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new PvpRequestError('INVALID_DECK');
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.cost !== 'number' ||
    !Array.isArray(record.effects)
  )
    throw new PvpRequestError('INVALID_DECK');
  return record as unknown as CardDefinition;
}
