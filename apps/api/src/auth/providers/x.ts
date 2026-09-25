import {
  configuredProvider,
  nonEmptyString,
  OAuthProviderExchangeError,
  type OAuthIdentity,
  type OAuthProviderAdapter,
  type OAuthProviderConfig,
} from './provider.js';

const authorizationEndpoint = 'https://twitter.com/i/oauth2/authorize';
const tokenEndpoint = 'https://api.x.com/2/oauth2/token';
const userInfoEndpoint = 'https://api.x.com/2/users/me';

export class XOAuthProvider implements OAuthProviderAdapter {
  readonly id = 'x' as const;

  constructor(
    private readonly config: OAuthProviderConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv): XOAuthProvider {
    return new XOAuthProvider(configuredProvider('x', environment));
  }

  authorizationUrl({
    redirectUri,
    state,
    codeChallenge,
  }: Parameters<OAuthProviderAdapter['authorizationUrl']>[0]): URL {
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'users.read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url;
  }

  async exchangeCode({
    redirectUri,
    code,
    codeVerifier,
  }: Parameters<OAuthProviderAdapter['exchangeCode']>[0]): Promise<OAuthIdentity> {
    const token = await this.request(tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      }),
    });
    const tokenBody = (await token.json().catch(() => undefined)) as
      { access_token?: unknown } | undefined;
    const accessToken = nonEmptyString(tokenBody?.access_token);
    if (!token.ok || accessToken === undefined)
      throw new OAuthProviderExchangeError('X token exchange failed.');
    const profile = await this.request(userInfoEndpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await profile.json().catch(() => undefined)) as
      { data?: Record<string, unknown> } | undefined;
    const providerUserId = nonEmptyString(body?.data?.id);
    if (!profile.ok || providerUserId === undefined)
      throw new OAuthProviderExchangeError('X profile lookup failed.');
    return {
      providerUserId,
      displayName: nonEmptyString(body?.data?.name) ?? 'X player',
      emailVerified: false,
    };
  }
}
