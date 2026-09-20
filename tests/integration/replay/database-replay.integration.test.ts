import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient, type Prisma } from '../../../apps/api/src/generated/prisma/client.js';
import { MatchReplayRepository } from '../../../apps/api/src/matches/replay-repository.js';
import {
  definitions,
  successfulReplay,
} from '../../../packages/game-engine/src/replay.test-support.js';
import { verifyReplay } from '../../../packages/game-engine/src/replay.js';

loadRootEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for replay database integration tests.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const repository = new MatchReplayRepository(prisma);
const replay = successfulReplay();

describe('database replay adapter', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const definition of definitions) {
      await prisma.card.upsert({
        where: { id: definition.id },
        update: {},
        create: { id: definition.id },
      });
      await prisma.cardVersion.upsert({
        where: { cardId_version: { cardId: definition.id, version: replay.cardDataVersion } },
        update: { definition: definition as Prisma.InputJsonValue },
        create: {
          cardId: definition.id,
          version: replay.cardDataVersion,
          definition: definition as Prisma.InputJsonValue,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.match.deleteMany({ where: { id: replay.matchId } });
    await prisma.cardVersion.deleteMany({
      where: { cardId: { in: definitions.map((definition) => definition.id) } },
    });
    await prisma.card.deleteMany({
      where: { id: { in: definitions.map((definition) => definition.id) } },
    });
    await prisma.$disconnect();
  });

  it('persists actions, events, and snapshots transactionally and reconstructs the replay', async () => {
    await repository.save(replay, definitions);

    const restored = await repository.load(replay.matchId);

    expect(restored).toEqual(replay);
    expect(verifyReplay(restored, definitions)).toEqual({ ok: true });
  });
});
