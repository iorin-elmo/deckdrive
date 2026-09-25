import {
  configuredProvider,
  nonEmptyString,
  OAuthProviderExchangeError,
  type OAuthIdentity,
  type OAuthProviderAdapter,
  type OAuthProviderConfig,
} from './provider.js';

const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const userInfoEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo';

export class GoogleOAuthProvider implements OAuthProviderAdapter {
  readonly id = 'google' as const;

  constructor(
    private readonly config: OAuthProviderConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv): GoogleOAuthProvider {
    return new GoogleOAuthProvider(configuredProvider('google', environment));
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
      scope: 'openid email profile',
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
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
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
      throw new OAuthProviderExchangeError('Google token exchange failed.');
    const profile = await this.request(userInfoEndpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await profile.json().catch(() => undefined)) as
      Record<string, unknown> | undefined;
    const providerUserId = nonEmptyString(body?.sub);
    if (!profile.ok || providerUserId === undefined)
      throw new OAuthProviderExchangeError('Google profile lookup failed.');
    const email = nonEmptyString(body?.email);
    return {
      providerUserId,
      displayName: nonEmptyString(body?.name) ?? nonEmptyString(body?.email) ?? 'Google player',
      ...(email === undefined ? {} : { email }),
      emailVerified: body?.email_verified === true,
    };
  }
}
