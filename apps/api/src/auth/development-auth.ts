export class DevelopmentAuthenticationDisabledError extends Error {
  constructor() {
    super('Development authentication is disabled outside development.');
    this.name = 'DevelopmentAuthenticationDisabledError';
  }
}

export function assertDevelopmentAuthentication(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== 'development') throw new DevelopmentAuthenticationDisabledError();
}
