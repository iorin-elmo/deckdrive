const loopbackDatabaseHosts = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertDevelopmentDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Development database commands require NODE_ENV=development.');
  }

  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('Development database commands require DATABASE_URL.');
  }

  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('Development database commands require a valid DATABASE_URL.');
  }

  const hostname = database.hostname.replace(/^\[(.*)\]$/u, '$1');
  if (!loopbackDatabaseHosts.has(hostname)) {
    throw new Error('Development database commands require a loopback DATABASE_URL host.');
  }

  if (database.searchParams.has('host')) {
    throw new Error('Development database commands do not allow DATABASE_URL host overrides.');
  }
}

export const assertDevelopmentSeedEnvironment = assertDevelopmentDatabaseEnvironment;
