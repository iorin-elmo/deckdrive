import { defineConfig, env } from 'prisma/config';

import { loadRootEnvironment } from './src/database/load-environment.js';

loadRootEnvironment();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed-runner.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
