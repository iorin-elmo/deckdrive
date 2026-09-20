import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient, type Prisma } from '../../../apps/api/src/generated/prisma/client.js';
import { MatchReplayRepository } from '../../../apps/api/src/matches/replay-repository.js';
import {
  createInitialBattleState,
  recordReplay,
  verifyReplay,
} from '../../../packages/game-engine/src/index.js';
import { definitions, fixture } from '../../../packages/game-engine/src/replay.test-support.js';
import type {
  CardDefinition,
  CardInstanceId,
  MatchId,
  PlayerId,
  Replay,
} from '../../../packages/game-engine/src/index.js';

loadRootEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined)
  throw new Error('DATABASE_URL is required for replay database integration tests.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const repository = new MatchReplayRepository(prisma);
const fixtureId = `d01-replay-${randomUUID()}`;
const testDefinitions: readonly CardDefinition[] = definitions.map((definition) => ({
  ...definition,
  id: `${fixtureId}-${definition.id}`,
}));
const replay = createReplay();

function createReplay(): Replay {
  const result = recordReplay(
    createInitialBattleState({
      matchId: fixtureId as MatchId,
      seed: fixture.seed,
      engineVersion: fixture.engineVersion,
      rulesVersion: fixture.rulesVersion,
      cardDataVersion: fixture.cardDataVersion,
      initialDrawCount: fixture.initialDrawCount,
      turnDrawCount: fixture.turnDrawCount,
      players: fixture.players.map((player) => ({
        id: player.id as PlayerId,
        drawPile: player.cards.map((card) => ({
          id: card.id as CardInstanceId,
          definitionId: `${fixtureId}-${card.definitionId}`,
        })),
      })),
    }),
    fixture.actions,
    testDefinitions,
    { snapshotInterval: 2 },
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.replay;
}

describe('database replay adapter', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const definition of testDefinitions) {
      await prisma.card.create({
        data: { id: definition.id },
      });
      await prisma.cardVersion.create({
        data: {
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
      where: { cardId: { in: testDefinitions.map((definition) => definition.id) } },
    });
    await prisma.card.deleteMany({
      where: { id: { in: testDefinitions.map((definition) => definition.id) } },
    });
    await prisma.$disconnect();
  });

  it('persists actions, events, and snapshots transactionally and reconstructs the replay', async () => {
    await repository.save(replay, testDefinitions);

    const restored = await repository.load(replay.matchId);

    expect(restored).toEqual(replay);
    expect(verifyReplay(restored, testDefinitions)).toEqual({ ok: true });
  });
});
