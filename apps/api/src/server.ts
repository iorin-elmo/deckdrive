import { PrismaPg } from '@prisma/adapter-pg';

import { ApiApplication } from './api/application.js';
import { createApiHttpServer } from './api/http.js';
import { loadRootEnvironment } from './database/load-environment.js';
import { PrismaClient } from './generated/prisma/client.js';
import { apiCorsOrigins, apiHost, apiPort, apiTrustedProxyAddresses } from './server-config.js';

loadRootEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0)
  throw new Error('DATABASE_URL is required to start the API.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const server = createApiHttpServer(new ApiApplication(prisma), {
  allowedOrigins: apiCorsOrigins(process.env.CORS_ORIGINS),
  developmentLoginLoopbackOnly: true,
  trustedProxyAddresses: apiTrustedProxyAddresses(process.env.TRUSTED_PROXY_ADDRESSES),
});
const host = apiHost(process.env.HOST);
const port = apiPort(process.env.PORT);

server.listen(port, host, () => {
  console.log(`DeckDrive API listening at http://${host}:${String(port)}`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
