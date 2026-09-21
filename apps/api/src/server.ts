import { PrismaPg } from '@prisma/adapter-pg';

import { ApiApplication } from './api/application.js';
import { createApiHttpServer } from './api/http.js';
import { loadRootEnvironment } from './database/load-environment.js';
import { PrismaClient } from './generated/prisma/client.js';
import { apiCorsOrigins, apiHost, apiPort } from './server-config.js';

loadRootEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0)
  throw new Error('DATABASE_URL is required to start the API.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const server = createApiHttpServer(new ApiApplication(prisma), {
  allowedOrigins: apiCorsOrigins(process.env.CORS_ORIGINS),
});
const host = apiHost(process.env.HOST);
const port = apiPort(process.env.PORT);

server.listen(port, host, () => {
  console.log(`DeckDrive API listening at http://${host}:${String(port)}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
