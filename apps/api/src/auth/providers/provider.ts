export type OAuthProviderId = 'discord';

export interface OAuthIdentity {
  readonly providerUserId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly emailVerified: boolean;
}

export interface OAuthProviderAdapter {
  readonly id: OAuthProviderId;
  authorizationUrl(input: {
    readonly redirectUri: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): URL;
  exchangeCode(input: {
    readonly redirectUri: string;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<OAuthIdentity>;
}

export interface OAuthProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export class OAuthProviderConfigurationError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super(`OAuth provider ${provider} is not configured.`);
  }
}

export class OAuthProviderExchangeError extends Error {}

export function configuredProvider(
  provider: OAuthProviderId,
  environment: NodeJS.ProcessEnv,
): OAuthProviderConfig {
  const prefix = provider.toUpperCase();
  const clientId = environment[`${prefix}_CLIENT_ID`];
  const clientSecret = environment[`${prefix}_CLIENT_SECRET`];
  if (
    clientId === undefined ||
    clientId.trim().length === 0 ||
    clientSecret === undefined ||
    clientSecret.trim().length === 0
  )
    throw new OAuthProviderConfigurationError(provider);
  return { clientId, clientSecret };
}

export async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
