import { defineConfig, env } from 'prisma/config';

import { loadRootEnvironment } from './src/database/load-environment.js';

loadRootEnvironment();

const databaseUrl =
  process.env.PRISMA_GENERATE_ONLY === 'true'
    ? (process.env.DATABASE_URL ?? 'postgresql://deckdrive:deckdrive@127.0.0.1:5432/deckdrive')
    : env('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed-runner.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
