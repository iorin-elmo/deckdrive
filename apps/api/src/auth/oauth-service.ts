import { Prisma, type OAuthProvider, type PrismaClient } from '../generated/prisma/client.js';
import { oauthStateCookieName, serializeCookie } from './cookies.js';
import { matchesSignature, randomToken, sha256, sign } from './crypto.js';
import { DiscordOAuthProvider } from './providers/discord.js';
import {
  OAuthProviderConfigurationError,
  OAuthProviderExchangeError,
  type OAuthIdentity,
  type OAuthProviderAdapter,
  type OAuthProviderId,
} from './providers/provider.js';
import { PrismaSessionService, type CreatedSession } from './session-service.js';

const authorizationLifetimeMilliseconds = 10 * 60 * 1000;
const consumedAuthorizationRetentionMilliseconds = 24 * 60 * 60 * 1000;

export class OAuthRequestError extends Error {
  constructor(readonly code: 'OAUTH_INVALID_REQUEST' | 'OAUTH_ACCOUNT_LINK_REQUIRED') {
    super(code);
  }
}

export class OAuthRateLimitError extends Error {}
export class OAuthSecurityConfigurationError extends Error {}

interface OAuthStateCookie {
  readonly state: string;
  readonly codeVerifier: string;
}

export interface OAuthStartResult {
  readonly location: string;
  readonly stateCookie: string;
}

export interface OAuthCompletionResult {
  readonly session: CreatedSession;
}

/**
 * Short-window in-memory protection for authorization endpoints. Deployments with
 * multiple API processes should replace it with their shared rate-limit store.
 */
export class OAuthRateLimiter {
  private readonly attempts = new Map<string, { attempts: number[]; lastSeen: number }>();

  constructor(
    private readonly maximumAttempts = 10,
    private readonly windowMilliseconds = 10 * 60 * 1000,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumKeys = 10_000,
  ) {}

  consume(key: string): void {
    const now = this.now().getTime();
    this.removeExpired(now);
    let bucket = this.attempts.get(key);
    if (bucket === undefined) {
      this.evictLeastRecentKey();
      bucket = { attempts: [], lastSeen: now };
      this.attempts.set(key, bucket);
    }
    if (bucket.attempts.length >= this.maximumAttempts) throw new OAuthRateLimitError();
    bucket.attempts.push(now);
    bucket.lastSeen = now;
  }

  private removeExpired(now: number): void {
    for (const [key, bucket] of this.attempts) {
      bucket.attempts = bucket.attempts.filter(
        (attempt) => attempt > now - this.windowMilliseconds,
      );
      if (bucket.attempts.length === 0) this.attempts.delete(key);
    }
  }

  private evictLeastRecentKey(): void {
    if (this.attempts.size < this.maximumKeys) return;
    const oldest = [...this.attempts.entries()].reduce((candidate, entry) =>
      entry[1].lastSeen < candidate[1].lastSeen ? entry : candidate,
    );
    this.attempts.delete(oldest[0]);
  }
}

export class OAuthService {
  private readonly adapters: ReadonlyMap<OAuthProviderId, OAuthProviderAdapter>;
  private readonly sessionService: PrismaSessionService;
  private readonly isSecure: boolean;
  private readonly redirectBaseUrl: string | undefined;
  private readonly applicationBaseUrl: string | undefined;
  private readonly stateSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    environment: NodeJS.ProcessEnv = process.env,
    private readonly rateLimiter = new OAuthRateLimiter(),
    private readonly now: () => Date = () => new Date(),
    adapters?: readonly OAuthProviderAdapter[],
  ) {
    this.isSecure = environment.NODE_ENV === 'production';
    this.redirectBaseUrl = oauthRedirectBaseUrl(environment);
    this.applicationBaseUrl = applicationBaseUrl(environment);
    this.stateSecret = oauthStateSecret(environment);
    this.sessionService = new PrismaSessionService(prisma, now);
    const configuredAdapters =
      adapters ??
      [safelyCreate(() => DiscordOAuthProvider.fromEnvironment(environment))].filter(
        (adapter): adapter is OAuthProviderAdapter => adapter !== undefined,
      );
    this.adapters = new Map(configuredAdapters.map((adapter) => [adapter.id, adapter]));
  }

  async start(
    provider: string,
    clientAddress: string | undefined,
    linkUserId?: string,
  ): Promise<OAuthStartResult> {
    const adapter = this.adapter(provider);
    this.rateLimiter.consume(`start:${clientAddress ?? 'unknown'}`);
    const stateSecret = this.requireStateSecret();
    const redirectUri = this.callbackUrl(adapter.id);
    await this.removeExpiredAuthorizations();
    const state = randomToken();
    const codeVerifier = randomToken(48);
    await this.prisma.oAuthAuthorization.create({
      data: {
        provider: providerValue(adapter.id),
        stateHash: sha256(state),
        codeVerifierHash: sha256(codeVerifier),
        ...(linkUserId === undefined ? {} : { linkUserId }),
        expiresAt: new Date(this.now().getTime() + authorizationLifetimeMilliseconds),
      },
    });
    return {
      location: adapter
        .authorizationUrl({
          redirectUri,
          state,
          codeChallenge: sha256(codeVerifier),
        })
        .toString(),
      stateCookie: this.stateCookie({ state, codeVerifier }, stateSecret),
    };
  }

  async complete(
    provider: string,
    input: Readonly<Record<string, string | undefined>>,
    signedStateCookie: string | undefined,
    clientAddress: string | undefined,
  ): Promise<OAuthCompletionResult> {
    const adapter = this.adapter(provider);
    this.rateLimiter.consume(`callback:${clientAddress ?? 'unknown'}`);
    this.requireStateSecret();
    const code = input.code;
    const state = input.state;
    const stateCookie = this.readStateCookie(signedStateCookie);
    if (
      code === undefined ||
      code.length === 0 ||
      state === undefined ||
      state.length === 0 ||
      stateCookie === undefined ||
      stateCookie.state !== state
    )
      throw new OAuthRequestError('OAUTH_INVALID_REQUEST');
    const consumed = await this.prisma.oAuthAuthorization.updateMany({
      where: {
        provider: providerValue(adapter.id),
        stateHash: sha256(state),
        codeVerifierHash: sha256(stateCookie.codeVerifier),
        consumedAt: null,
        expiresAt: { gt: this.now() },
      },
      data: { consumedAt: this.now() },
    });
    if (consumed.count !== 1) throw new OAuthRequestError('OAUTH_INVALID_REQUEST');
    const authorization = await this.prisma.oAuthAuthorization.findUnique({
      where: { stateHash: sha256(state) },
      select: { linkUserId: true },
    });
    if (authorization === null) throw new OAuthRequestError('OAUTH_INVALID_REQUEST');
    let identity: OAuthIdentity;
    try {
      identity = await adapter.exchangeCode({
        redirectUri: this.callbackUrl(adapter.id),
        code,
        codeVerifier: stateCookie.codeVerifier,
      });
    } catch (error) {
      if (error instanceof OAuthProviderExchangeError) throw error;
      throw new OAuthProviderExchangeError('OAuth provider request failed.');
    }
    const userId = await this.resolveUser(adapter.id, identity, authorization.linkUserId);
    return { session: await this.sessionService.create(userId) };
  }

  session(): PrismaSessionService {
    return this.sessionService;
  }

  sessionCookie(session: CreatedSession): string[] {
    const maxAge = Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - this.now().getTime()) / 1000),
    );
    return [
      serializeCookie('deckdrive_session', session.token, {
        httpOnly: true,
        secure: this.isSecure,
        sameSite: 'Lax',
        maxAge,
      }),
      serializeCookie('deckdrive_csrf', session.csrfToken, {
        secure: this.isSecure,
        sameSite: 'Strict',
        maxAge,
      }),
    ];
  }

  expiredStateCookie(): string {
    return serializeCookie(oauthStateCookieName, '', {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'Lax',
      maxAge: 0,
      path: '/api/v1/auth/oauth',
    });
  }

  completionLocation(): string {
    if (this.applicationBaseUrl === undefined)
      throw new OAuthSecurityConfigurationError('APP_BASE_URL is required for OAuth callbacks.');
    return `${this.applicationBaseUrl}/login?returnTo=%2Fhome`;
  }

  private adapter(provider: string): OAuthProviderAdapter {
    if (!isOAuthProviderId(provider)) throw new OAuthRequestError('OAUTH_INVALID_REQUEST');
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) throw new OAuthProviderConfigurationError(provider);
    return adapter;
  }

  private callbackUrl(provider: OAuthProviderId): string {
    if (this.redirectBaseUrl === undefined)
      throw new OAuthSecurityConfigurationError('OAUTH_REDIRECT_BASE_URL is required for OAuth.');
    return `${this.redirectBaseUrl}/api/v1/auth/oauth/${provider}/callback`;
  }

  private requireStateSecret(): string {
    if (this.stateSecret === undefined)
      throw new OAuthSecurityConfigurationError(
        'SESSION_SECRET must be at least 32 characters in production.',
      );
    return this.stateSecret;
  }

  private stateCookie(value: OAuthStateCookie, stateSecret: string): string {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    return serializeCookie(oauthStateCookieName, `${payload}.${sign(payload, stateSecret)}`, {
      httpOnly: true,
      secure: this.isSecure,
      sameSite: 'Lax',
      maxAge: Math.floor(authorizationLifetimeMilliseconds / 1000),
      path: '/api/v1/auth/oauth',
    });
  }

  private readStateCookie(value: string | undefined): OAuthStateCookie | undefined {
    if (value === undefined || this.stateSecret === undefined) return undefined;
    const [payload, signature, ...rest] = value.split('.');
    if (
      payload === undefined ||
      signature === undefined ||
      rest.length > 0 ||
      !matchesSignature(payload, signature, this.stateSecret)
    )
      return undefined;
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Partial<OAuthStateCookie>;
      return typeof parsed.state === 'string' &&
        parsed.state.length > 0 &&
        typeof parsed.codeVerifier === 'string' &&
        parsed.codeVerifier.length > 0
        ? { state: parsed.state, codeVerifier: parsed.codeVerifier }
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveUser(
    provider: OAuthProviderId,
    identity: OAuthIdentity,
    linkUserId: string | null,
  ): Promise<string> {
    const providerValueForIdentity = providerValue(provider);
    const account = await this.accountForIdentity(
      providerValueForIdentity,
      identity.providerUserId,
    );
    if (linkUserId !== null) {
      if (account !== null && account.userId !== linkUserId)
        throw new OAuthRequestError('OAUTH_ACCOUNT_LINK_REQUIRED');
      if (account === null) {
        const alreadyLinked = await this.prisma.oAuthAccount.findUnique({
          where: { userId_provider: { userId: linkUserId, provider: providerValueForIdentity } },
          select: { id: true },
        });
        if (alreadyLinked !== null) throw new OAuthRequestError('OAUTH_ACCOUNT_LINK_REQUIRED');
        try {
          await this.prisma.oAuthAccount.create({
            data: {
              userId: linkUserId,
              provider: providerValueForIdentity,
              providerUserId: identity.providerUserId,
            },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          const winner = await this.accountForIdentity(
            providerValueForIdentity,
            identity.providerUserId,
          );
          if (winner?.userId !== linkUserId)
            throw new OAuthRequestError('OAUTH_ACCOUNT_LINK_REQUIRED');
        }
      }
      return linkUserId;
    }
    if (account !== null) return account.userId;
    if (identity.emailVerified && identity.email !== undefined) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: identity.email },
        select: { id: true },
      });
      if (emailOwner !== null) throw new OAuthRequestError('OAUTH_ACCOUNT_LINK_REQUIRED');
    }
    try {
      const user = await this.prisma.$transaction((transaction) =>
        transaction.user.create({
          data: {
            ...(identity.emailVerified && identity.email !== undefined
              ? { email: identity.email }
              : {}),
            displayName: identity.displayName,
            player: { create: {} },
            oauthAccounts: {
              create: {
                provider: providerValueForIdentity,
                providerUserId: identity.providerUserId,
              },
            },
          },
          select: { id: true },
        }),
      );
      return user.id;
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await this.accountForIdentity(
        providerValueForIdentity,
        identity.providerUserId,
      );
      if (winner !== null) return winner.userId;
      if (identity.emailVerified && identity.email !== undefined) {
        const emailOwner = await this.prisma.user.findUnique({
          where: { email: identity.email },
          select: { id: true },
        });
        if (emailOwner !== null) throw new OAuthRequestError('OAUTH_ACCOUNT_LINK_REQUIRED');
      }
      throw error;
    }
  }

  private async accountForIdentity(provider: OAuthProvider, providerUserId: string) {
    return this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      select: { userId: true },
    });
  }

  private async removeExpiredAuthorizations(): Promise<void> {
    const now = this.now();
    await this.prisma.oAuthAuthorization.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: now } },
          {
            consumedAt: {
              lte: new Date(now.getTime() - consumedAuthorizationRetentionMilliseconds),
            },
          },
        ],
      },
    });
  }
}

function safelyCreate(create: () => OAuthProviderAdapter): OAuthProviderAdapter | undefined {
  try {
    return create();
  } catch (error) {
    if (error instanceof OAuthProviderConfigurationError) return undefined;
    throw error;
  }
}

function isOAuthProviderId(value: string): value is OAuthProviderId {
  return value === 'discord';
}

function providerValue(provider: OAuthProviderId): OAuthProvider {
  return provider.toUpperCase() as OAuthProvider;
}

function oauthRedirectBaseUrl(environment: NodeJS.ProcessEnv): string | undefined {
  const configured = environment.OAUTH_REDIRECT_BASE_URL;
  if (configured === undefined || configured.trim().length === 0) {
    return environment.NODE_ENV === 'production' ? undefined : 'http://localhost:3000';
  }
  return new URL(configured).origin;
}

function oauthStateSecret(environment: NodeJS.ProcessEnv): string | undefined {
  const configured = environment.SESSION_SECRET;
  if (configured !== undefined && configured.length >= 32) return configured;
  if (environment.NODE_ENV === 'production') return undefined;
  return 'development-only-oauth-state-secret-not-for-production';
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function applicationBaseUrl(environment: NodeJS.ProcessEnv): string | undefined {
  const configured = environment.APP_BASE_URL;
  if (configured === undefined || configured.trim().length === 0) {
    return environment.NODE_ENV === 'production' ? undefined : 'http://localhost:5173';
  }
  return new URL(configured).origin;
}
