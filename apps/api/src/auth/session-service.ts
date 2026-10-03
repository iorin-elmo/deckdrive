import type { OAuthProvider, PrismaClient } from '../generated/prisma/client.js';
import { matchesHash, randomToken, sha256 } from './crypto.js';

const sessionLifetimeSeconds = 60 * 60 * 24 * 14;
const revokedSessionRetentionMilliseconds = 24 * 60 * 60 * 1000;

export interface CreatedSession {
  readonly token: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
}

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly playerId: string;
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly authProvider: OAuthProvider | null;
}

export class PrismaSessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(userId: string, authProvider?: OAuthProvider): Promise<CreatedSession> {
    await this.removeExpiredSessions();
    const token = randomToken();
    const csrfToken = sessionCsrfToken(token);
    const expiresAt = new Date(this.now().getTime() + sessionLifetimeSeconds * 1000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        csrfTokenHash: sha256(csrfToken),
        expiresAt,
        ...(authProvider === undefined ? {} : { authProvider }),
      },
    });
    return { token, csrfToken, expiresAt };
  }

  async authenticate(token: string | undefined): Promise<AuthenticatedSession | undefined> {
    if (token === undefined || token.length === 0) return undefined;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        userId: true,
        csrfTokenHash: true,
        authProvider: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { player: { select: { id: true } } } },
      },
    });
    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= this.now().getTime() ||
      session.user.player === null
    )
      return undefined;
    return {
      sessionId: session.id,
      userId: session.userId,
      playerId: session.user.player.id,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
      authProvider: session.authProvider ?? null,
    };
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token === undefined || token.length === 0) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  async recoverCsrfToken(
    session: AuthenticatedSession,
    token: string,
  ): Promise<string | undefined> {
    // All recoveries for this opaque session converge on the same secret. The
    // domain prefix keeps it distinct from the stored session-token hash.
    const csrfToken = sessionCsrfToken(token);
    const updated = await this.prisma.session.updateMany({
      where: {
        id: session.sessionId,
        tokenHash: sha256(token),
        csrfTokenHash: session.csrfTokenHash,
        revokedAt: null,
        expiresAt: { gt: this.now() },
      },
      data: { csrfTokenHash: sha256(csrfToken) },
    });
    if (updated.count === 1) return csrfToken;
    const winner = await this.authenticate(token);
    return winner !== undefined &&
      winner.sessionId === session.sessionId &&
      this.verifiesCsrf(winner, csrfToken)
      ? csrfToken
      : undefined;
  }

  verifiesCsrf(session: AuthenticatedSession, token: string | undefined): boolean {
    return token !== undefined && token.length > 0 && matchesHash(token, session.csrfTokenHash);
  }

  private async removeExpiredSessions(): Promise<void> {
    const now = this.now();
    await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          { revokedAt: { lte: new Date(now.getTime() - revokedSessionRetentionMilliseconds) } },
        ],
      },
    });
  }
}

function sessionCsrfToken(token: string): string {
  return sha256(`deckdrive:csrf:${token}`);
}
