import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { PrismaClient, type Prisma } from '../../../apps/api/src/generated/prisma/client.js';
import { MatchReplayRepository } from '../../../apps/api/src/matches/replay-repository.js';
import {
  createInitialBattleState,
  calculateDraftDefinitionRevision,
  recordReplay,
  recordReplayV2,
  verifyReplay,
  verifyReplayV2,
} from '../../../packages/game-engine/src/index.js';
import { definitions, fixture } from '../../../packages/game-engine/src/replay.test-support.js';
import type {
  CardDefinition,
  CardDefinitionV2,
  BattleInput,
  BattleStateV2,
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
const rollbackReplay = createReplay(`${fixtureId}-rollback`);
const rollbackTriggerName = `rbt_${randomUUID().replaceAll('-', '')}`;
const rollbackFunctionName = `${rollbackTriggerName}_fn`;
const v2MatchId = `${fixtureId}-v2`;
const v2RollbackMatchId = `${fixtureId}-v2-rollback`;
const v2RollbackTriggerName = `rbt_${randomUUID().replaceAll('-', '')}`;
const v2RollbackFunctionName = `${v2RollbackTriggerName}_fn`;
const v2Fixture = JSON.parse(
  readFileSync(
    new URL('../../fixtures/replays/phase-51-protocol-v2.json', import.meta.url),
    'utf8',
  ),
) as {
  definitions: CardDefinitionV2[];
  initial: BattleStateV2;
  inputs: BattleInput[];
};
const v2Definitions: CardDefinitionV2[] = [
  ...v2Fixture.definitions,
  {
    id: `${fixtureId}-v2-marker`,
    version: '1.0.0',
    cost: 0,
    effects: [{ type: 'DAMAGE', amount: 1, target: 'ENEMY' }],
    keywords: [],
    deckLimit: 3,
  },
];
const v2RollbackDefinitions: CardDefinitionV2[] = [
  ...v2Definitions,
  {
    id: `${fixtureId}-v2-rollback-marker`,
    version: '1.0.0',
    cost: 0,
    effects: [{ type: 'DAMAGE', amount: 1, target: 'ENEMY' }],
    keywords: [],
    deckLimit: 3,
  },
];
const v2Replay = createReplayV2(v2MatchId, v2Definitions);
const v2RollbackReplay = createReplayV2(v2RollbackMatchId, v2RollbackDefinitions);
const v2Repository = new MatchReplayRepository(prisma, () => true);

function createReplayV2(matchId: string, snapshot: CardDefinitionV2[]) {
  const recorded = recordReplayV2(
    { ...v2Fixture.initial, matchId: matchId as MatchId },
    v2Fixture.inputs,
    snapshot,
    {
      draftDefinitionRevision: calculateDraftDefinitionRevision(snapshot),
      battleProtocolVersion: 2,
      snapshotInterval: 1,
      authorizeServerCommand: () => true,
    },
  );
  if (!recorded.ok) throw new Error(recorded.error.message);
  return recorded.replay;
}

function createReplay(matchId = fixtureId): Replay {
  const result = recordReplay(
    createInitialBattleState({
      matchId: matchId as MatchId,
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
    await prisma.match.deleteMany({
      where: {
        id: {
          in: [replay.matchId, rollbackReplay.matchId, v2Replay.matchId, v2RollbackReplay.matchId],
        },
      },
    });
    await prisma.replayDefinitionSnapshot.deleteMany({
      where: {
        revision: {
          in: [v2Replay.draftDefinitionRevision, v2RollbackReplay.draftDefinitionRevision],
        },
      },
    });
    await prisma.cardVersion.deleteMany({
      where: { cardId: { in: testDefinitions.map((definition) => definition.id) } },
    });
    await prisma.card.deleteMany({
      where: { id: { in: testDefinitions.map((definition) => definition.id) } },
    });
    await prisma.$disconnect();
  });

  it('persists actions, events, and snapshots transactionally and reconstructs the replay', async () => {
    await repository.save(replay);

    const restored = await repository.load(replay.matchId);

    expect(restored).toEqual(replay);
    expect(verifyReplay(restored, testDefinitions)).toEqual({ ok: true });
  });

  it('rolls back every replay row when a child write fails', async () => {
    const escapedMatchId = rollbackReplay.matchId.replaceAll("'", "''");
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${rollbackFunctionName}"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced replay child write failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${rollbackTriggerName}"
      BEFORE INSERT ON "match_actions"
      FOR EACH ROW
      WHEN (NEW."match_id" = '${escapedMatchId}' AND NEW."sequence" = 2)
      EXECUTE FUNCTION "${rollbackFunctionName}"();
    `);

    try {
      await expect(repository.save(rollbackReplay)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${rollbackTriggerName}" ON "match_actions"`,
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${rollbackFunctionName}"()`);
    }

    const [match, actionCount, eventCount, snapshotCount] = await Promise.all([
      prisma.match.findUnique({ where: { id: rollbackReplay.matchId } }),
      prisma.matchAction.count({ where: { matchId: rollbackReplay.matchId } }),
      prisma.matchEvent.count({ where: { matchId: rollbackReplay.matchId } }),
      prisma.matchSnapshot.count({ where: { matchId: rollbackReplay.matchId } }),
    ]);
    expect(match).toBeNull();
    expect(actionCount).toBe(0);
    expect(eventCount).toBe(0);
    expect(snapshotCount).toBe(0);
  });

  it('round-trips signed Replay V2 through PostgreSQL and verifies every persisted boundary', async () => {
    await v2Repository.save(v2Replay, v2Definitions);
    const restored = await v2Repository.load(v2Replay.matchId);
    expect(restored).toEqual(v2Replay);
    expect(
      verifyReplayV2(
        v2Replay,
        (revision) => (revision === v2Replay.draftDefinitionRevision ? v2Definitions : undefined),
        () => true,
      ),
    ).toEqual({ ok: true });
    const [match, actions, commands, events, snapshots, definitionSnapshot] = await Promise.all([
      prisma.match.findUnique({ where: { id: v2Replay.matchId } }),
      prisma.matchAction.findMany({ where: { matchId: v2Replay.matchId } }),
      prisma.matchServerCommand.findMany({ where: { matchId: v2Replay.matchId } }),
      prisma.matchEvent.findMany({ where: { matchId: v2Replay.matchId } }),
      prisma.matchSnapshot.findMany({ where: { matchId: v2Replay.matchId } }),
      prisma.replayDefinitionSnapshot.findUnique({
        where: { revision: v2Replay.draftDefinitionRevision },
      }),
    ]);
    expect(match).toMatchObject({
      formatVersion: 2,
      battleProtocolVersion: 2,
      draftDefinitionRevision: v2Replay.draftDefinitionRevision,
    });
    expect(actions).toHaveLength(v2Replay.actions.length);
    expect(commands.map((command) => command.sequence).sort()).toEqual(
      v2Replay.serverCommands.map((command) => command.inputSequence),
    );
    expect(events).toHaveLength(v2Replay.events.length);
    expect(snapshots).toHaveLength(v2Replay.snapshots.length);
    expect(
      snapshots.every(
        (snapshot) => snapshot.actionIndex === null && snapshot.inputSequence !== null,
      ),
    ).toBe(true);
    expect(definitionSnapshot?.definitions).toEqual(v2Definitions);
  });

  it('rolls back V2 metadata, commands, events, and snapshots when a command write fails', async () => {
    const escapedMatchId = v2RollbackReplay.matchId.replaceAll("'", "''");
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${v2RollbackFunctionName}"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced Replay V2 command write failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${v2RollbackTriggerName}"
      BEFORE INSERT ON "match_server_commands"
      FOR EACH ROW
      WHEN (NEW."match_id" = '${escapedMatchId}')
      EXECUTE FUNCTION "${v2RollbackFunctionName}"();
    `);
    try {
      await expect(v2Repository.save(v2RollbackReplay, v2RollbackDefinitions)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${v2RollbackTriggerName}" ON "match_server_commands"`,
      );
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${v2RollbackFunctionName}"()`);
    }
    const [match, actions, commands, events, snapshots, definitionSnapshot] = await Promise.all([
      prisma.match.findUnique({ where: { id: v2RollbackReplay.matchId } }),
      prisma.matchAction.count({ where: { matchId: v2RollbackReplay.matchId } }),
      prisma.matchServerCommand.count({ where: { matchId: v2RollbackReplay.matchId } }),
      prisma.matchEvent.count({ where: { matchId: v2RollbackReplay.matchId } }),
      prisma.matchSnapshot.count({ where: { matchId: v2RollbackReplay.matchId } }),
      prisma.replayDefinitionSnapshot.findUnique({
        where: {
          revision: v2RollbackReplay.draftDefinitionRevision,
        },
      }),
    ]);
    expect(match).toBeNull();
    expect([actions, commands, events, snapshots]).toEqual([0, 0, 0, 0]);
    expect(definitionSnapshot).toBeNull();
  });
});
