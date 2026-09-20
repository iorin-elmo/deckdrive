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

  if (!loopbackDatabaseHosts.has(database.hostname)) {
    throw new Error('Development database commands require a loopback DATABASE_URL host.');
  }
}

export const assertDevelopmentSeedEnvironment = assertDevelopmentDatabaseEnvironment;
