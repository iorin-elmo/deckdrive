import { randomUUID } from 'node:crypto';
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
  readonly createSession?: (input: CreatePvpState<TDeck>) => Omit<MatchSessionOptions, 'state'>;
  readonly session?: Omit<MatchSessionOptions, 'state'>;
}

export type CasualQueueResult<TDeck> =
  | { readonly status: 'QUEUED'; readonly queueId: string }
  | {
      readonly status: 'MATCHED';
      readonly queueId: string;
      readonly matchId: string;
      readonly session: MatchSession;
      readonly players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
    };

export type CasualQueueStatus =
  | { readonly status: 'QUEUED'; readonly queueId: string }
  | { readonly status: 'MATCHED'; readonly queueId: string; readonly matchId: string };

export type PrivateMatchStatus =
  | { readonly status: 'INVITED'; readonly inviteCode: string }
  | { readonly status: 'MATCHED'; readonly inviteCode: string; readonly matchId: string };

export interface PrivateMatchResult<TDeck> {
  readonly inviteCode: string;
  readonly host: LobbyPlayer<TDeck>;
}

/**
 * Server-owned pairing state for Casual and Private matches. Decks are opaque
 * values here: the API layer loads and validates them before entering the lobby.
 */
export class PvpLobby<TDeck> {
  private readonly casualQueue: Array<{
    queueId: string;
    player: LobbyPlayer<TDeck>;
    reserved: boolean;
  }> = [];
  private readonly invites = new Map<string, { player: LobbyPlayer<TDeck>; reserved: boolean }>();
  private readonly queueStatuses = new Map<
    string,
    { playerId: PlayerId; status: 'QUEUED' | 'MATCHED'; matchId?: string }
  >();
  private readonly privateStatuses = new Map<
    string,
    { playerId: PlayerId; status: 'INVITED' | 'MATCHED'; matchId?: string }
  >();
  private readonly activeSessions = new Map<string, MatchSession>();

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
      (entry) => entry.player.playerId !== player.playerId && !entry.reserved,
    );
    if (opponentIndex < 0) {
      const queueId = randomUUID();
      this.casualQueue.push({ queueId, player, reserved: false });
      this.queueStatuses.set(queueId, { playerId: player.playerId, status: 'QUEUED' });
      return { status: 'QUEUED', queueId };
    }
    const opponent = this.casualQueue[opponentIndex]!;
    opponent.reserved = true;
    try {
      return {
        status: 'MATCHED',
        queueId: opponent.queueId,
        ...this.createSession('CASUAL', opponent.player, player),
      };
    } catch (error) {
      opponent.reserved = false;
      throw error;
    }
  }

  createPrivate(host: LobbyPlayer<TDeck>): PrivateMatchResult<TDeck> {
    let inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    while (this.invites.has(inviteCode))
      inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    this.invites.set(inviteCode, { player: host, reserved: false });
    this.privateStatuses.set(inviteCode, { playerId: host.playerId, status: 'INVITED' });
    return { inviteCode, host };
  }

  joinPrivate(
    inviteCode: string,
    guest: LobbyPlayer<TDeck>,
  ): {
    inviteCode: string;
    matchId: string;
    session: MatchSession;
    players: readonly [LobbyPlayer<TDeck>, LobbyPlayer<TDeck>];
  } {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const invite = this.invites.get(normalizedCode);
    if (invite === undefined || invite.reserved) throw new Error('PRIVATE_INVITE_NOT_FOUND');
    if (invite.player.playerId === guest.playerId) throw new Error('PRIVATE_INVITE_SELF_JOIN');
    invite.reserved = true;
    try {
      return { inviteCode: normalizedCode, ...this.createSession('PRIVATE', invite.player, guest) };
    } catch (error) {
      invite.reserved = false;
      throw error;
    }
  }

  commitCasual(queueId: string): void {
    const index = this.casualQueue.findIndex((entry) => entry.queueId === queueId);
    if (index >= 0) this.casualQueue.splice(index, 1);
  }

  markCasualMatched(queueId: string, matchId: string): void {
    const status = this.queueStatuses.get(queueId);
    if (status !== undefined) {
      status.status = 'MATCHED';
      status.matchId = matchId;
    }
  }

  releaseCasual(queueId: string): void {
    const entry = this.casualQueue.find((candidate) => candidate.queueId === queueId);
    if (entry !== undefined) entry.reserved = false;
  }

  commitPrivate(inviteCode: string): void {
    this.invites.delete(inviteCode.trim().toUpperCase());
  }

  markPrivateMatched(inviteCode: string, matchId: string): void {
    const status = this.privateStatuses.get(inviteCode.trim().toUpperCase());
    if (status !== undefined) {
      status.status = 'MATCHED';
      status.matchId = matchId;
    }
  }

  casualStatus(queueId: string, playerId: PlayerId): CasualQueueStatus | undefined {
    const status = this.queueStatuses.get(queueId);
    if (status === undefined || status.playerId !== playerId) return undefined;
    return status.status === 'MATCHED' && status.matchId !== undefined
      ? { status: 'MATCHED', queueId, matchId: status.matchId }
      : { status: 'QUEUED', queueId };
  }

  casualStatusForPlayer(playerId: PlayerId): CasualQueueStatus | undefined {
    for (const [queueId, status] of this.queueStatuses) {
      if (status.playerId !== playerId) continue;
      return status.status === 'MATCHED' && status.matchId !== undefined
        ? { status: 'MATCHED', queueId, matchId: status.matchId }
        : { status: 'QUEUED', queueId };
    }
    return undefined;
  }

  privateStatus(inviteCode: string, playerId: PlayerId): PrivateMatchStatus | undefined {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const status = this.privateStatuses.get(normalizedCode);
    if (status === undefined || status.playerId !== playerId) return undefined;
    return status.status === 'MATCHED' && status.matchId !== undefined
      ? { status: 'MATCHED', inviteCode: normalizedCode, matchId: status.matchId }
      : { status: 'INVITED', inviteCode: normalizedCode };
  }

  releasePrivate(inviteCode: string): void {
    const invite = this.invites.get(inviteCode.trim().toUpperCase());
    if (invite !== undefined) invite.reserved = false;
  }

  find(matchId: string): MatchSession | undefined {
    return this.activeSessions.get(matchId);
  }

  sessions(): readonly MatchSession[] {
    return [...this.activeSessions.values()];
  }

  restore(session: MatchSession): void {
    this.activeSessions.set(session.matchId, session);
  }

  remove(matchId: string): void {
    this.activeSessions.delete(matchId);
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
    const input = { mode, matchId, players: [first, second] as const };
    const session = new MatchSession({
      ...(this.options.createSession?.(input) ?? this.options.session),
      state: this.options.createState(input),
    });
    this.activeSessions.set(matchId, session);
    return { matchId, session, players: [first, second] };
  }
}
