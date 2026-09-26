import { describe, expect, it, vi } from 'vitest';

import { DiscordOAuthProvider } from './discord.js';
import { OAuthProviderExchangeError } from './provider.js';

const config = { clientId: 'discord-client', clientSecret: 'discord-secret' };

describe('DiscordOAuthProvider', () => {
  it('builds an authorization-code PKCE URL with Discord credentials and scopes', () => {
    const provider = new DiscordOAuthProvider(config);

    const url = provider.authorizationUrl({
      redirectUri: 'https://api.example.test/api/v1/auth/oauth/discord/callback',
      state: 'state-value',
      codeChallenge: 'challenge-value',
    });

    expect(url.origin + url.pathname).toBe('https://discord.com/api/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'discord-client',
      redirect_uri: 'https://api.example.test/api/v1/auth/oauth/discord/callback',
      response_type: 'code',
      scope: 'identify email',
      state: 'state-value',
      code_challenge: 'challenge-value',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges a code and maps a verified Discord profile', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'discord-user',
            global_name: 'Discord Player',
            username: 'fallback-name',
            email: 'player@example.test',
            verified: true,
          }),
        ),
      );
    const provider = new DiscordOAuthProvider(config, request as typeof fetch);

    await expect(
      provider.exchangeCode({
        redirectUri: 'https://api.example.test/api/v1/auth/oauth/discord/callback',
        code: 'authorization-code',
        codeVerifier: 'verifier-value',
      }),
    ).resolves.toEqual({
      providerUserId: 'discord-user',
      displayName: 'Discord Player',
      email: 'player@example.test',
      emailVerified: true,
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    const tokenRequest = request.mock.calls[0]?.[1] as RequestInit;
    expect(Object.fromEntries(new URLSearchParams(String(tokenRequest.body)))).toEqual({
      client_id: 'discord-client',
      client_secret: 'discord-secret',
      redirect_uri: 'https://api.example.test/api/v1/auth/oauth/discord/callback',
      grant_type: 'authorization_code',
      code: 'authorization-code',
      code_verifier: 'verifier-value',
    });
    expect(request).toHaveBeenNthCalledWith(2, 'https://discord.com/api/users/@me', {
      headers: { authorization: 'Bearer access-token' },
    });
  });

  it('rejects an unsuccessful or malformed token response before profile lookup', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const provider = new DiscordOAuthProvider(config, request as typeof fetch);

    await expect(
      provider.exchangeCode({
        redirectUri: 'https://api.example.test/callback',
        code: 'code',
        codeVerifier: 'v',
      }),
    ).rejects.toBeInstanceOf(OAuthProviderExchangeError);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsuccessful profile response after a valid token exchange', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' })))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const provider = new DiscordOAuthProvider(config, request as typeof fetch);

    await expect(
      provider.exchangeCode({
        redirectUri: 'https://api.example.test/callback',
        code: 'code',
        codeVerifier: 'v',
      }),
    ).rejects.toBeInstanceOf(OAuthProviderExchangeError);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
