import { PrismaPg } from '@prisma/adapter-pg';
import type { PlayerId } from '@deck-drive/game-engine';

import { ApiApplication } from './api/application.js';
import { closePvpWebSocket, createApiHttpServer } from './api/http.js';
import { parseCookies, sessionCookieName } from './auth/cookies.js';
import { OAuthService } from './auth/oauth-service.js';
import { loadRootEnvironment } from './database/load-environment.js';
import { PrismaClient } from './generated/prisma/client.js';
import { PvpMatchService } from './pvp/service.js';
import {
  apiCorsOrigins,
  apiHost,
  apiPort,
  apiTrustedProxyAddresses,
  pvpWorkerCount,
} from './server-config.js';

loadRootEnvironment();

if (pvpWorkerCount(process.env.PVP_WORKER_COUNT) !== 1)
  throw new Error('PvP requires PVP_WORKER_COUNT=1 until shared matchmaking is enabled.');

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0)
  throw new Error('DATABASE_URL is required to start the API.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const oauth = new OAuthService(prisma, process.env);
const allowedOrigins = apiCorsOrigins(process.env.CORS_ORIGINS, oauth.applicationOrigin());
const pvp = new PvpMatchService(prisma, async (request) => {
  const sessionToken = parseCookies(request.headers.cookie)[sessionCookieName];
  const session = await oauth.session().authenticate(sessionToken);
  if (session !== undefined) return session.playerId as PlayerId;
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const playerId = request.headers['x-deckdrive-player-id'];
    if (typeof playerId === 'string' && playerId.trim().length > 0) {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true },
      });
      if (player !== null) return player.id as PlayerId;
    }
  }
  return null;
});
await pvp.restoreActive();
const server = createApiHttpServer(new ApiApplication(prisma, process.env, pvp), {
  allowedOrigins,
  developmentLoginLoopbackOnly: true,
  trustedProxyAddresses: apiTrustedProxyAddresses(process.env.TRUSTED_PROXY_ADDRESSES),
  pvpWebSocket: {
    registry: pvp,
    options: { allowedOrigins },
  },
});
const host = apiHost(process.env.HOST);
const port = apiPort(process.env.PORT);

server.listen(port, host, () => {
  console.log(`DeckDrive API listening at http://${host}:${String(port)}`);
});

async function shutdown(): Promise<void> {
  closePvpWebSocket(server);
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
