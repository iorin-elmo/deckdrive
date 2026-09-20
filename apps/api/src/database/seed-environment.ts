export function assertDevelopmentSeedEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Development seed requires NODE_ENV=development and is disabled otherwise.');
  }
}
