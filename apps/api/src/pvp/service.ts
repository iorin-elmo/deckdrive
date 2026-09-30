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
import type { PrismaClient } from '../generated/prisma/client.js';
import { deckSize } from '../decks/deck-validation.js';
import { PrismaPvpMatchPersistence, PvpConcurrentMatchError } from './persistence.js';
import { PvpLobby, type LobbyPlayer, type RestoredPvpMatch } from './lobby.js';
import {
  MatchSession,
  type AcceptedAction,
  type MatchSnapshot,
  type RestoredRequest,
} from './session.js';

const pvpStatusRetentionMs = 5 * 60_000;

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
      readonly result: { readonly inviteCode: string; readonly host: LobbyPlayer<PvpDeck> };
      readonly expiresAt: number;
    }
  >();
  private readonly matchmakingRateLimiter = new PvpRateLimiter();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly authenticator: PvpAuthenticator = developmentAuthenticator,
  ) {
    this.persistence = new PrismaPvpMatchPersistence(prisma);
    this.lobby = new PvpLobby({
      createState: ({ matchId, players }) => createState(matchId, players),
      canPair: (candidate, incoming) =>
        candidate.deck.cardDataVersion === incoming.deck.cardDataVersion,
      createSession: ({ matchId, players }) => ({
        definitions: mergeDefinitions(players.flatMap((player) => player.deck.definitions)),
        onPlayerConnect: (playerId) =>
          this.persistence.setPlayerDisconnected(matchId, playerId, null),
        onPlayerDisconnect: (playerId, disconnectedAt) =>
          this.persistence.setPlayerDisconnected(matchId, playerId, disconnectedAt),
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
        return existing.result;
      }
    }
    this.matchmakingRateLimiter.consume(`${playerId}:private-create`, 5, 60_000);
    try {
      const result = this.lobby.createPrivate(await this.loadPlayerDeck(playerId, deckId));
      if (requestKey !== undefined)
        this.privateCreateRequests.set(requestKey, {
          deckId,
          result,
          expiresAt: Date.now() + pvpStatusRetentionMs,
        });
      return result;
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
      where: { status: 'IN_PROGRESS', mode: { in: ['CASUAL', 'PRIVATE'] } },
      select: { id: true },
    });
    await Promise.all(matches.map((match) => this.find(match.id)));
  }

  authenticate(request: IncomingMessage): Promise<PlayerId | null> | PlayerId | null {
    return this.authenticator(request);
  }

  private async loadPlayerDeck(playerId: string, deckId: string): Promise<LobbyPlayer<PvpDeck>> {
    const deck = await this.prisma.deck.findFirst({
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
          select: { playerId: true, seat: true, deckSnapshot: true, disconnectedAt: true },
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
          sequence: entry.sequence,
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
      history: {
        actions,
        events,
        snapshots,
        turnStartedAt: turnStartedAt.getTime(),
        requests,
        disconnectedAt: match.players.flatMap((player) =>
          player.disconnectedAt === null
            ? []
            : [{ playerId: player.playerId as PlayerId, at: player.disconnectedAt.getTime() }],
        ),
      },
      onAction: async (accepted) => {
        await this.persistAction(accepted);
        if (accepted.state.phase === 'MATCH_END') this.lobby.remove(accepted.matchId);
      },
      onAbandoned: async (abandonedMatchId) => {
        await this.persistence.abandon(abandonedMatchId);
        this.lobby.remove(abandonedMatchId);
      },
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
      readonly mode: 'CASUAL' | 'PRIVATE';
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
      | 'RATE_LIMITED',
  ) {
    super(code);
    this.name = 'PvpRequestError';
  }
}

function createState(
  matchId: MatchId,
  players: readonly [LobbyPlayer<PvpDeck>, LobbyPlayer<PvpDeck>],
) {
  if (players[0].deck.cardDataVersion !== players[1].deck.cardDataVersion)
    throw new PvpRequestError('INVALID_DECK');
  const seed = randomUUID();
  return createInitialBattleState({
    matchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
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
