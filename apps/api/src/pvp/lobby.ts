import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import type { MatchId, PlayerId } from '@deck-drive/game-engine';

import { MatchSession, type MatchSessionOptions } from './session.js';

export type PvpMode = 'CASUAL' | 'PRIVATE';

export interface LobbyPlayer<TDeck> {
  readonly playerId: PlayerId;
  /** Server-loaded deck data. Never accept card definitions from the client. */
  readonly deck: TDeck;
}

export interface CreatePvpState<TDeck> {
  readonly mode: PvpMode;
  readonly matchId: MatchId;
  readonly players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
}

export interface PvpLobbyOptions<TDeck> {
  readonly createState: (input: CreatePvpState<TDeck>) => MatchSessionOptions['state'];
  readonly session?: Omit<MatchSessionOptions, 'state'>;
}

export type CasualQueueResult<TDeck> =
  | { readonly status: 'QUEUED'; readonly queueId: string }
  | {
      readonly status: 'MATCHED';
      readonly matchId: string;
      readonly session: MatchSession;
      readonly players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
    };

export interface PrivateMatchResult<TDeck> {
  readonly inviteCode: string;
  readonly host: LobbyPlayer<TDeck>;
}

/**
 * Server-owned pairing state for Casual and Private matches. Decks are opaque
 * values here: the API layer loads and validates them before entering the lobby.
 */
export class PvpLobby<TDeck> {
  private readonly casualQueue: Array<{ queueId: string; player: LobbyPlayer<TDeck> }> = [];
  private readonly invites = new Map<string, { player: LobbyPlayer<TDeck> }>();
  private readonly sessions = new Map<string, MatchSession>();

  constructor(private readonly options: PvpLobbyOptions<TDeck>) {}

  enqueueCasual(player: LobbyPlayer<TDeck>): CasualQueueResult<TDeck> {
    const alreadyQueued = this.casualQueue.some(
      (entry) => entry.player.playerId === player.playerId,
    );
    if (alreadyQueued)
      return {
        status: 'QUEUED',
        queueId: this.casualQueue.find((entry) => entry.player.playerId === player.playerId)!
          .queueId,
      };
    const opponentIndex = this.casualQueue.findIndex(
      (entry) => entry.player.playerId !== player.playerId,
    );
    if (opponentIndex < 0) {
      const queueId = randomUUID();
      this.casualQueue.push({ queueId, player });
      return { status: 'QUEUED', queueId };
    }
    const opponent = this.casualQueue.splice(opponentIndex, 1)[0]!;
    return { status: 'MATCHED', ...this.createSession('CASUAL', opponent.player, player) };
  }

  createPrivate(host: LobbyPlayer<TDeck>): PrivateMatchResult<TDeck> {
    let inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    while (this.invites.has(inviteCode))
      inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    this.invites.set(inviteCode, { player: host });
    return { inviteCode, host };
  }

  joinPrivate(
    inviteCode: string,
    guest: LobbyPlayer<TDeck>,
  ): {
    matchId: string;
    session: MatchSession;
    players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
  } {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const invite = this.invites.get(normalizedCode);
    if (invite === undefined) throw new Error('PRIVATE_INVITE_NOT_FOUND');
    if (invite.player.playerId === guest.playerId) throw new Error('PRIVATE_INVITE_SELF_JOIN');
    this.invites.delete(normalizedCode);
    return this.createSession('PRIVATE', invite.player, guest);
  }

  find(matchId: string): MatchSession | undefined {
    return this.sessions.get(matchId);
  }

  /** Development-compatible fallback. O00 should replace this with session-cookie auth. */
  authenticate(request: IncomingMessage): PlayerId | null {
    const playerId = request.headers['x-deckdrive-player-id'];
    return typeof playerId === 'string' && playerId.trim().length > 0
      ? (playerId as PlayerId)
      : null;
  }

  remove(matchId: string): void {
    this.sessions.delete(matchId);
  }

  private createSession(
    mode: PvpMode,
    first: LobbyPlayer<TDeck>,
    second: LobbyPlayer<TDeck>,
  ): {
    matchId: string;
    session: MatchSession;
    players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
  } {
    const matchId = randomUUID() as MatchId;
    const session = new MatchSession({
      ...this.options.session,
      state: this.options.createState({ mode, matchId, players: [first, second] }),
    });
    this.sessions.set(matchId, session);
    return { matchId, session, players: [first, second] };
  }
}
