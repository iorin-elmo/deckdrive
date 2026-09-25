import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { sha256 } from './crypto.js';
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

    const result = await service.start('discord', '127.0.0.1');

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
});
