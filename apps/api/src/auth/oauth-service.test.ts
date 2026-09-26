import { describe, expect, it, vi } from 'vitest';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { parseCookies } from './cookies.js';
import { sha256 } from './crypto.js';
import {
  OAuthRateLimiter,
  OAuthRequestError,
  OAuthService,
  oauthReturnPath,
  oauthStateCookieNameFor,
} from './oauth-service.js';
import type { OAuthIdentity, OAuthProviderAdapter } from './providers/provider.js';

describe('OAuthRateLimiter', () => {
  it('rejects a request that exceeds its rolling window and permits it after expiry', () => {
    let timestamp = 0;
    const limiter = new OAuthRateLimiter(2, 100, () => new Date(timestamp));
    limiter.consume('client');
    limiter.consume('client');
    expect(() => limiter.consume('client')).toThrow();
    timestamp = 101;
    expect(() => limiter.consume('client')).not.toThrow();
  });

  it('bounds retained client keys while continuing to rate-limit each active key', () => {
    let timestamp = 0;
    const limiter = new OAuthRateLimiter(1, 100, () => new Date(timestamp), 2);
    limiter.consume('first');
    timestamp = 1;
    limiter.consume('second');
    timestamp = 2;
    limiter.consume('third');
    expect(() => limiter.consume('first')).not.toThrow();
    expect(() => limiter.consume('third')).toThrow();
  });
});

describe('oauthReturnPath', () => {
  it('permits application-local routes and rejects external destinations', () => {
    expect(oauthReturnPath('/decks/deck-1/edit')).toBe('/decks/deck-1/edit');
    expect(oauthReturnPath('//example.test')).toBe('/home');
    expect(oauthReturnPath('/\\example.test')).toBe('/home');
  });
});

describe('OAuthService', () => {
  it('stores hashes only and sends state plus an S256 PKCE challenge to the provider', async () => {
    const create = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const adapter: OAuthProviderAdapter = {
      id: 'discord',
      authorizationUrl: vi.fn().mockImplementation(({ state, codeChallenge }) => {
        const url = new URL('https://provider.example/authorize');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', codeChallenge);
        return url;
      }),
      exchangeCode: vi.fn(),
    };
    const service = new OAuthService(
      { oAuthAuthorization: { create, deleteMany } } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    const result = await service.start('discord', '127.0.0.1', undefined, '/decks/deck-1/edit');

    expect(result.location).toContain('state=');
    expect(result.location).toContain('code_challenge=');
    expect(result.stateCookie).toContain('HttpOnly');
    expect(result.stateCookie).toContain('SameSite=Lax');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'DISCORD',
        stateHash: expect.any(String),
        codeVerifierHash: expect.any(String),
      }),
    });
    const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    const state = new URL(result.location).searchParams.get('state');
    expect(state).not.toBeNull();
    expect(data.stateHash).toBe(sha256(state!));
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const signedState = parseCookies(result.stateCookie)[oauthStateCookieNameFor(state!)];
    const payload = signedState?.split('.')[0];
    expect(payload).toBeDefined();
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))).toMatchObject({
      returnTo: '/decks/deck-1/edit',
    });
  });

  it('keeps signed OAuth state cookies independent for concurrent login attempts', async () => {
    const adapter: OAuthProviderAdapter = {
      id: 'discord',
      authorizationUrl: vi.fn().mockImplementation(({ state }) => {
        const url = new URL('https://provider.example/authorize');
        url.searchParams.set('state', state);
        return url;
      }),
      exchangeCode: vi.fn(),
    };
    const service = new OAuthService(
      { oAuthAuthorization: { create: vi.fn(), deleteMany: vi.fn() } } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    const first = await service.start('discord', '127.0.0.1');
    const second = await service.start('discord', '127.0.0.1');
    const firstState = new URL(first.location).searchParams.get('state');
    const secondState = new URL(second.location).searchParams.get('state');

    expect(firstState).not.toBeNull();
    expect(secondState).not.toBeNull();
    expect(oauthStateCookieNameFor(firstState!)).not.toBe(oauthStateCookieNameFor(secondState!));
    expect(parseCookies(first.stateCookie)[oauthStateCookieNameFor(firstState!)]).toBeDefined();
    expect(parseCookies(second.stateCookie)[oauthStateCookieNameFor(secondState!)]).toBeDefined();
  });

  it('rejects a callback without the matching signed state cookie before token exchange', async () => {
    const exchangeCode = vi.fn();
    const adapter: OAuthProviderAdapter = {
      id: 'discord',
      authorizationUrl: vi.fn(),
      exchangeCode,
    };
    const service = new OAuthService(
      {} as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    await expect(
      service.complete('discord', { code: 'code', state: 'state' }, undefined, '127.0.0.1'),
    ).rejects.toEqual(expect.any(OAuthRequestError));
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('fails closed when production has no stable session secret', async () => {
    const adapter: OAuthProviderAdapter = {
      id: 'discord',
      authorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
    };
    const service = new OAuthService(
      {} as PrismaClient,
      {
        NODE_ENV: 'production',
        OAUTH_REDIRECT_BASE_URL: 'https://api.example.test',
        APP_BASE_URL: 'https://app.example.test',
      },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    await expect(service.start('discord', '127.0.0.1')).rejects.toThrow(
      'SESSION_SECRET must be at least 32 characters',
    );
  });

  it('validates the application callback destination before persisting or consuming state', async () => {
    const create = vi.fn();
    const updateMany = vi.fn();
    const adapter: OAuthProviderAdapter = {
      id: 'discord',
      authorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
    };
    const service = new OAuthService(
      { oAuthAuthorization: { create, updateMany } } as unknown as PrismaClient,
      {
        NODE_ENV: 'production',
        SESSION_SECRET: 'a'.repeat(32),
        OAUTH_REDIRECT_BASE_URL: 'https://api.example.test',
      },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    await expect(service.start('discord', '127.0.0.1')).rejects.toThrow('APP_BASE_URL is required');
    await expect(
      service.complete('discord', { code: 'code', state: 'state' }, 'invalid-cookie', '127.0.0.1'),
    ).rejects.toThrow('APP_BASE_URL is required');
    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects linking an OAuth identity that is already owned by another user', async () => {
    const service = new OAuthService(
      {
        oAuthAccount: { findUnique: vi.fn().mockResolvedValue({ userId: 'other-user' }) },
      } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
    );

    await expect(
      resolveUser(
        service,
        { providerUserId: 'discord-user', displayName: 'Discord User', emailVerified: false },
        'link-user',
      ),
    ).rejects.toMatchObject({ code: 'OAUTH_ACCOUNT_LINK_REQUIRED' });
  });

  it('requires an explicit link when a verified OAuth email belongs to an existing user', async () => {
    const service = new OAuthService(
      {
        oAuthAccount: { findUnique: vi.fn().mockResolvedValue(null) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'email-owner' }) },
      } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
    );

    await expect(
      resolveUser(service, {
        providerUserId: 'discord-user',
        displayName: 'Discord User',
        email: 'player@example.test',
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: 'OAUTH_ACCOUNT_LINK_REQUIRED' });
  });

  it('uses the OAuth account created by a concurrent callback after a unique conflict', async () => {
    const uniqueConflict = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const service = new OAuthService(
      {
        oAuthAccount: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ userId: 'concurrent-winner' }),
        },
        $transaction: vi.fn((operation) =>
          operation({ user: { create: vi.fn().mockRejectedValue(uniqueConflict) } }),
        ),
      } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
    );

    await expect(
      resolveUser(service, {
        providerUserId: 'discord-user',
        displayName: 'Discord User',
        emailVerified: false,
      }),
    ).resolves.toBe('concurrent-winner');
  });
});

function resolveUser(
  service: OAuthService,
  identity: OAuthIdentity,
  linkUserId: string | null = null,
): Promise<string> {
  const resolve = Reflect.get(service, 'resolveUser') as (
    provider: 'discord',
    value: OAuthIdentity,
    linkUser: string | null,
  ) => Promise<string>;
  return resolve.call(service, 'discord', identity, linkUserId);
}
