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
  readonly now?: () => number;
  readonly statusRetentionMs?: number;
  readonly maxOpenInvitesPerPlayer?: number;
}

export interface RestoredPvpMatch {
  readonly mode: PvpMode;
  readonly queueId?: string;
  readonly inviteCode?: string;
  readonly playerIds: readonly [PlayerId, PlayerId];
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
    createdAt: number;
  }> = [];
  private readonly invites = new Map<
    string,
    { player: LobbyPlayer<TDeck>; reserved: boolean; createdAt: number }
  >();
  private readonly queueStatuses = new Map<
    string,
    {
      playerIds: readonly PlayerId[];
      status: 'QUEUED' | 'MATCHED';
      matchId?: string;
      updatedAt: number;
    }
  >();
  private readonly privateStatuses = new Map<
    string,
    {
      playerIds: readonly PlayerId[];
      status: 'INVITED' | 'MATCHED';
      matchId?: string;
      updatedAt: number;
    }
  >();
  private readonly activeSessions = new Map<string, MatchSession>();
  private readonly retainedSessions = new Map<
    string,
    { session: MatchSession; expiresAt: number }
  >();

  constructor(private readonly options: PvpLobbyOptions<TDeck>) {
    if ((options.statusRetentionMs ?? 5 * 60_000) <= 0)
      throw new RangeError('statusRetentionMs must be positive.');
  }

  enqueueCasual(player: LobbyPlayer<TDeck>): CasualQueueResult<TDeck> {
    this.pruneStatuses();
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
      this.casualQueue.push({ queueId, player, reserved: false, createdAt: this.now() });
      this.queueStatuses.set(queueId, {
        playerIds: [player.playerId],
        status: 'QUEUED',
        updatedAt: this.now(),
      });
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
    this.pruneStatuses();
    const openInvites = [...this.invites.values()].filter(
      (invite) => invite.player.playerId === host.playerId,
    ).length;
    if (openInvites >= (this.options.maxOpenInvitesPerPlayer ?? 3))
      throw new Error('PRIVATE_INVITE_LIMIT');
    let inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    while (this.invites.has(inviteCode))
      inviteCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
    this.invites.set(inviteCode, { player: host, reserved: false, createdAt: this.now() });
    this.privateStatuses.set(inviteCode, {
      playerIds: [host.playerId],
      status: 'INVITED',
      updatedAt: this.now(),
    });
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
      status.updatedAt = this.now();
    }
  }

  setCasualParticipants(queueId: string, playerIds: readonly PlayerId[]): void {
    const status = this.queueStatuses.get(queueId);
    if (status !== undefined) {
      status.playerIds = [...playerIds];
      status.updatedAt = this.now();
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
      status.updatedAt = this.now();
    }
  }

  setPrivateParticipants(inviteCode: string, playerIds: readonly PlayerId[]): void {
    const status = this.privateStatuses.get(inviteCode.trim().toUpperCase());
    if (status !== undefined) {
      status.playerIds = [...playerIds];
      status.updatedAt = this.now();
    }
  }

  casualStatus(queueId: string, playerId: PlayerId): CasualQueueStatus | undefined {
    this.pruneStatuses();
    const status = this.queueStatuses.get(queueId);
    if (status === undefined || !status.playerIds.includes(playerId)) return undefined;
    return status.status === 'MATCHED' && status.matchId !== undefined
      ? { status: 'MATCHED', queueId, matchId: status.matchId }
      : { status: 'QUEUED', queueId };
  }

  casualStatusForPlayer(playerId: PlayerId): CasualQueueStatus | undefined {
    this.pruneStatuses();
    for (const [queueId, status] of this.queueStatuses) {
      if (!status.playerIds.includes(playerId)) continue;
      return status.status === 'MATCHED' && status.matchId !== undefined
        ? { status: 'MATCHED', queueId, matchId: status.matchId }
        : { status: 'QUEUED', queueId };
    }
    return undefined;
  }

  privateStatus(inviteCode: string, playerId: PlayerId): PrivateMatchStatus | undefined {
    this.pruneStatuses();
    const normalizedCode = inviteCode.trim().toUpperCase();
    const status = this.privateStatuses.get(normalizedCode);
    if (status === undefined || !status.playerIds.includes(playerId)) return undefined;
    return status.status === 'MATCHED' && status.matchId !== undefined
      ? { status: 'MATCHED', inviteCode: normalizedCode, matchId: status.matchId }
      : { status: 'INVITED', inviteCode: normalizedCode };
  }

  releasePrivate(inviteCode: string): void {
    const invite = this.invites.get(inviteCode.trim().toUpperCase());
    if (invite !== undefined) invite.reserved = false;
  }

  find(matchId: string): MatchSession | undefined {
    this.pruneStatuses();
    return this.activeSessions.get(matchId) ?? this.retainedSessions.get(matchId)?.session;
  }

  sessions(): readonly MatchSession[] {
    this.pruneStatuses();
    return [...this.activeSessions.values()];
  }

  restore(session: MatchSession, metadata?: RestoredPvpMatch): void {
    this.activeSessions.set(session.matchId, session);
    if (metadata?.mode === 'CASUAL' && metadata.queueId !== undefined) {
      this.queueStatuses.set(metadata.queueId, {
        playerIds: [...metadata.playerIds],
        status: 'MATCHED',
        matchId: session.matchId,
        updatedAt: this.now(),
      });
    }
    if (metadata?.mode === 'PRIVATE' && metadata.inviteCode !== undefined) {
      this.privateStatuses.set(metadata.inviteCode, {
        playerIds: [...metadata.playerIds],
        status: 'MATCHED',
        matchId: session.matchId,
        updatedAt: this.now(),
      });
    }
  }

  remove(matchId: string): void {
    this.activeSessions.delete(matchId);
    this.retainedSessions.delete(matchId);
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
    const specificOptions = this.options.createSession?.(input) ?? {};
    const baseOptions = this.options.session ?? {};
    const session = new MatchSession({
      ...baseOptions,
      ...specificOptions,
      onAction: async (accepted) => {
        await baseOptions.onAction?.(accepted);
        await specificOptions.onAction?.(accepted);
        if (accepted.state.phase === 'MATCH_END') this.retain(matchId, session);
      },
      onAbandoned: async (abandonedMatchId) => {
        await baseOptions.onAbandoned?.(abandonedMatchId);
        await specificOptions.onAbandoned?.(abandonedMatchId);
        this.remove(abandonedMatchId);
      },
      state: this.options.createState(input),
    });
    this.activeSessions.set(matchId, session);
    return { matchId, session, players: [first, second] };
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private retain(matchId: string, session: MatchSession): void {
    this.activeSessions.delete(matchId);
    this.retainedSessions.set(matchId, {
      session,
      expiresAt: this.now() + (this.options.statusRetentionMs ?? 5 * 60_000),
    });
  }

  private pruneStatuses(): void {
    const cutoff = this.now() - (this.options.statusRetentionMs ?? 5 * 60_000);
    for (let index = this.casualQueue.length - 1; index >= 0; index -= 1) {
      const entry = this.casualQueue[index]!;
      if (entry.reserved || entry.createdAt >= cutoff) continue;
      this.casualQueue.splice(index, 1);
      this.queueStatuses.delete(entry.queueId);
    }
    for (const [inviteCode, invite] of this.invites) {
      if (!invite.reserved && invite.createdAt < cutoff) {
        this.invites.delete(inviteCode);
        this.privateStatuses.delete(inviteCode);
      }
    }
    for (const [queueId, status] of this.queueStatuses) {
      if (status.status === 'MATCHED' && status.updatedAt < cutoff)
        this.queueStatuses.delete(queueId);
    }
    for (const [inviteCode, status] of this.privateStatuses) {
      if (status.status === 'MATCHED' && status.updatedAt < cutoff)
        this.privateStatuses.delete(inviteCode);
    }
    for (const [matchId, retained] of this.retainedSessions) {
      if (retained.expiresAt < this.now()) this.retainedSessions.delete(matchId);
    }
  }
}
