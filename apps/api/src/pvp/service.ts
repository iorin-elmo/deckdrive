import { randomUUID } from 'node:crypto';

import {
  createInitialBattleState,
  type CardDefinition,
  type CardInstance,
  type MatchId,
  type PlayerId,
} from '@deck-drive/game-engine';
import type { IncomingMessage } from 'node:http';
import type { PrismaClient } from '../generated/prisma/client.js';
import { deckSize } from '../decks/deck-validation.js';
import { PrismaPvpMatchPersistence } from './persistence.js';
import { PvpLobby, type LobbyPlayer } from './lobby.js';
import { MatchSession } from './session.js';

interface PvpDeck {
  readonly cardDataVersion: string;
  readonly cards: readonly CardInstance[];
  readonly snapshot: unknown;
}

/** API-facing orchestration for validated player decks and PvP sessions. */
export class PvpMatchService {
  private readonly persistence: PrismaPvpMatchPersistence;
  private readonly lobby: PvpLobby<PvpDeck>;

  constructor(private readonly prisma: PrismaClient) {
    this.persistence = new PrismaPvpMatchPersistence(prisma);
    this.lobby = new PvpLobby({
      createState: ({ matchId, players }) => createState(matchId, players),
      session: {
        onAction: (accepted) => this.persistence.append(accepted),
        onAbandoned: (matchId) => this.persistence.abandon(matchId),
      },
    });
  }

  async enqueueCasual(playerId: string, deckId: string) {
    const player = await this.loadPlayerDeck(playerId, deckId);
    const result = this.lobby.enqueueCasual(player);
    if (result.status === 'QUEUED') return result;
    try {
      await this.persistNewMatch(result.session, result.players);
    } catch (error) {
      this.lobby.remove(result.matchId);
      throw error;
    }
    return result;
  }

  async createPrivate(playerId: string, deckId: string) {
    return this.lobby.createPrivate(await this.loadPlayerDeck(playerId, deckId));
  }

  async joinPrivate(playerId: string, inviteCode: string, deckId: string) {
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
      await this.persistNewMatch(result.session, result.players);
    } catch (error) {
      this.lobby.remove(result.matchId);
      throw error;
    }
    return result;
  }

  find(matchId: string): MatchSession | undefined {
    return this.lobby.find(matchId);
  }

  authenticate(request: IncomingMessage): PlayerId | null {
    // O00 can replace this resolver with its HttpOnly session-cookie lookup.
    const playerId = request.headers['x-deckdrive-player-id'];
    return typeof playerId === 'string' && playerId.trim().length > 0
      ? (playerId as PlayerId)
      : null;
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
    if (cards.length !== deckSize) throw new PvpRequestError('INVALID_DECK');
    return {
      playerId: playerId as PlayerId,
      deck: {
        cardDataVersion: deck.cardDataVersion,
        cards,
        snapshot: deck,
      },
    };
  }

  private async persistNewMatch(
    session: MatchSession,
    players: readonly [LobbyPlayer<PvpDeck>, LobbyPlayer<PvpDeck>],
  ): Promise<void> {
    const state = session.currentState;
    await this.persistence.create(state, [
      { playerId: players[0].playerId, deckSnapshot: players[0].deck.snapshot },
      { playerId: players[1].playerId, deckSnapshot: players[1].deck.snapshot },
    ]);
  }
}

export class PvpRequestError extends Error {
  constructor(
    readonly code:
      'DECK_NOT_FOUND' | 'INVALID_DECK' | 'PRIVATE_INVITE_NOT_FOUND' | 'PRIVATE_INVITE_SELF_JOIN',
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
  return createInitialBattleState({
    matchId,
    engineVersion: '1.0.0',
    rulesVersion: '1.0.0',
    cardDataVersion: players[0].deck.cardDataVersion,
    seed: randomUUID(),
    initialDrawCount: 5,
    turnDrawCount: 1,
    players: players.map((player) => ({ id: player.playerId, drawPile: player.deck.cards })),
  });
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
