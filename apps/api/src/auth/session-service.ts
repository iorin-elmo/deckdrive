import type { PrismaClient } from '../generated/prisma/client.js';
import { matchesHash, randomToken, sha256 } from './crypto.js';

const sessionLifetimeSeconds = 60 * 60 * 24 * 14;

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
}

export class PrismaSessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(userId: string): Promise<CreatedSession> {
    const token = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(this.now().getTime() + sessionLifetimeSeconds * 1000);
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(token), csrfTokenHash: sha256(csrfToken), expiresAt },
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
    };
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token === undefined || token.length === 0) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  verifiesCsrf(session: AuthenticatedSession, token: string | undefined): boolean {
    return token !== undefined && token.length > 0 && matchesHash(token, session.csrfTokenHash);
  }
}
