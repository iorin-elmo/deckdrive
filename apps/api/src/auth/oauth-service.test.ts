import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { OAuthRateLimiter, OAuthRequestError, OAuthService } from './oauth-service.js';
import type { OAuthProviderAdapter } from './providers/provider.js';

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
});

describe('OAuthService', () => {
  it('stores hashes only and sends state plus an S256 PKCE challenge to the provider', async () => {
    const create = vi.fn().mockResolvedValue({});
    const adapter: OAuthProviderAdapter = {
      id: 'google',
      authorizationUrl: vi.fn().mockImplementation(({ state, codeChallenge }) => {
        const url = new URL('https://provider.example/authorize');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', codeChallenge);
        return url;
      }),
      exchangeCode: vi.fn(),
    };
    const service = new OAuthService(
      { oAuthAuthorization: { create } } as unknown as PrismaClient,
      { SESSION_SECRET: 'a'.repeat(32) },
      new OAuthRateLimiter(),
      () => new Date('2026-09-27T00:00:00.000Z'),
      [adapter],
    );

    const result = await service.start('google', '127.0.0.1');

    expect(result.location).toContain('state=');
    expect(result.location).toContain('code_challenge=');
    expect(result.stateCookie).toContain('HttpOnly');
    expect(result.stateCookie).toContain('SameSite=Lax');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'GOOGLE',
        stateHash: expect.any(String),
        codeVerifierHash: expect.any(String),
      }),
    });
    const data = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(String(data.stateHash)).not.toContain('state=');
  });

  it('rejects a callback without the matching signed state cookie before token exchange', async () => {
    const exchangeCode = vi.fn();
    const adapter: OAuthProviderAdapter = {
      id: 'google',
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
      service.complete('google', { code: 'code', state: 'state' }, undefined, '127.0.0.1'),
    ).rejects.toEqual(expect.any(OAuthRequestError));
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});
