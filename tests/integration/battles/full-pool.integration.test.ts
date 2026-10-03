import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { allCardDefinitions } from '../../../packages/card-definitions/src/index.js';
import type { GameActionV2 } from '../../../packages/game-engine/src/index.js';
import {
  verifyPlayerReplayViewV2,
  type PlayerReplayViewV2,
} from '../../../packages/game-engine/src/index.js';
import { PrismaPackOpeningService } from '../../../apps/api/src/packs/prisma-pack-opening.js';
import { PrismaClient, type Prisma } from '../../../apps/api/src/generated/prisma/client.js';
import { loadRootEnvironment } from '../../../apps/api/src/database/load-environment.js';
import { AlphaBattleService } from '../../../apps/api/src/battles/alpha-service.js';
import {
  exchangeCard,
  exchangeCosts,
  grantAdminCollection,
} from '../../../apps/api/src/cards/acquisition.js';
import { discordOwnerId } from '../../../apps/api/src/admin/identity.js';
loadRootEnvironment();
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required.');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const service = new AlphaBattleService(prisma, 'complete-card-pool-integration-secret-32');
const playerIds: string[] = [],
  userIds: string[] = [];
type View = {
  id: string;
  status: string;
  inviteCode: string;
  state: {
    lastInputSequence: number;
    players: { id: string; hp: number; hand: { id: string; definitionId: string }[] }[];
  };
  legalActions: GameActionV2[];
  result: { status: string; reason: string; specialVictoryId?: string };
};
const view = (value: unknown) => value as View;
async function player(admin = false) {
  const user = await prisma.user.create({
    data: { email: `pool-${randomUUID()}@example.test`, displayName: 'Pool test' },
  });
  userIds.push(user.id);
  const player = await prisma.player.create({ data: { userId: user.id } });
  playerIds.push(player.id);
  if (admin)
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'DISCORD', providerUserId: discordOwnerId },
    });
  return player.id;
}
async function deck(playerId: string, className: string) {
  const definitions = allCardDefinitions.filter((card) => card.class === className).slice(0, 10);
  const versions = await Promise.all(
    definitions.map((definition) =>
      prisma.cardVersion.findUniqueOrThrow({
        where: { cardId_version: { cardId: definition.id, version: definition.version } },
      }),
    ),
  );
  for (const version of versions)
    await prisma.playerCard.upsert({
      where: { playerId_cardVersionId: { playerId, cardVersionId: version.id } },
      create: { playerId, cardVersionId: version.id, quantity: 3 },
      update: { quantity: 3 },
    });
  return prisma.deck.create({
    data: {
      playerId,
      name: `test-${randomUUID()}`,
      cardDataVersion: '1.0.0',
      cards: {
        create: versions.map((version, position) => ({
          cardVersionId: version.id,
          quantity: 3,
          position,
        })),
      },
    },
  });
}
async function act(playerId: string, battle: View, action: GameActionV2) {
  return view(
    await service.action(playerId, battle.id, {
      requestId: randomUUID(),
      expectedSequence: battle.state.lastInputSequence,
      action,
    }),
  );
}
describe('complete card pool persistence and transport', () => {
  beforeAll(async () => {
    for (const definition of allCardDefinitions) {
      await prisma.card.upsert({
        where: { id: definition.id },
        create: { id: definition.id },
        update: {},
      });
      await prisma.cardVersion.upsert({
        where: { cardId_version: { cardId: definition.id, version: definition.version } },
        create: {
          cardId: definition.id,
          version: definition.version,
          definition: definition as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
    }
  }, 30000);
  afterAll(async () => {
    await prisma.adminCardEntitlement.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.packOpening.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.alphaBattle.deleteMany({ where: { hostId: { in: playerIds } } });
    await prisma.deck.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.currencyTransaction.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.playerCard.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 30000);
  it('grants every card only to the verified administrator', async () => {
    const admin = await player(true),
      ordinary = await player();
    await Promise.all([
      grantAdminCollection(prisma, admin),
      grantAdminCollection(prisma, ordinary),
    ]);
    const owned = await prisma.playerCard.findMany({ where: { playerId: admin } });
    expect(owned).toHaveLength(allCardDefinitions.length);
    expect(owned.every((card) => card.quantity === 3)).toBe(true);
    expect(await prisma.playerCard.count({ where: { playerId: ordinary } })).toBe(0);
  });
  it('lets an ordinary player acquire new cards from packs and retries without charging twice', async () => {
    const id = await player();
    await prisma.currencyTransaction.create({
      data: {
        playerId: id,
        currency: 'GEM',
        amount: 10000,
        reason: 'TEST',
        idempotencyKey: randomUUID(),
      },
    });
    const packs = new PrismaPackOpeningService(prisma);
    const newVersions = await prisma.cardVersion.findMany({
      where: {
        cardId: {
          in: allCardDefinitions
            .filter((card) => card.effects.some((effect) => effect.type === 'POOL_CARD'))
            .map((card) => card.id),
        },
      },
    });
    const newIds = new Set(newVersions.map((card) => card.id));
    let acquired = false;
    for (let seed = 0; seed < 20 && !acquired; seed++) {
      const request = {
        playerId: id,
        productId: 'NORMAL_PACK' as const,
        idempotencyKey: randomUUID(),
        seed: `new-pool-${seed}`,
      };
      const result = await packs.open(request);
      expect(await packs.open(request)).toEqual(result);
      acquired = result.cards.some((card) => newIds.has(card.id));
    }
    expect(acquired).toBe(true);
    expect(
      await prisma.playerCard.count({
        where: { playerId: id, cardVersionId: { in: [...newIds] } },
      }),
    ).toBeGreaterThan(0);
  });
  it('makes exchange retries and concurrent copy-limit checks atomic', async () => {
    const id = await player(),
      version = await prisma.cardVersion.findUniqueOrThrow({
        where: { cardId_version: { cardId: 'sword_001', version: '1.0.0' } },
      });
    await prisma.currencyTransaction.create({
      data: {
        playerId: id,
        currency: 'EXCHANGE_POINT',
        amount: 1000,
        reason: 'TEST',
        idempotencyKey: randomUUID(),
      },
    });
    const key = randomUUID();
    await Promise.all([
      exchangeCard(prisma, id, version.id, key),
      exchangeCard(prisma, id, version.id, key),
    ]);
    expect(
      await prisma.playerCard.findUnique({
        where: { playerId_cardVersionId: { playerId: id, cardVersionId: version.id } },
      }),
    ).toMatchObject({ quantity: 1 });
    await exchangeCard(prisma, id, version.id, randomUUID());
    const results = await Promise.allSettled([
      exchangeCard(prisma, id, version.id, randomUUID()),
      exchangeCard(prisma, id, version.id, randomUUID()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.currencyTransaction.aggregate({
        where: { playerId: id, currency: 'EXCHANGE_POINT' },
        _sum: { amount: true },
      }),
    ).toMatchObject({ _sum: { amount: 1000 - 3 * exchangeCosts.N! } });
  });
  it('joins PvP, survives a new service instance, and deduplicates actions', async () => {
    const host = await player(),
      guest = await player(),
      hostDeck = await deck(host, 'SWORD'),
      guestDeck = await deck(guest, 'GUARDIAN');
    const waiting = view(await service.start(host, { mode: 'PRIVATE', deckId: hostDeck.id }));
    const joined = view(await service.join(guest, waiting.inviteCode, { deckId: guestDeck.id }));
    expect(joined.status).toBe('IN_PROGRESS');
    const battle = view(
      await new AlphaBattleService(prisma, 'complete-card-pool-integration-secret-32').read(
        host,
        joined.id,
      ),
    );
    const action = battle.legalActions.find((action) => action.type === 'PLAY_CARD')!;
    const request = { requestId: randomUUID(), expectedSequence: 0, action };
    const results = await Promise.all([
      service.action(host, battle.id, request),
      service.action(host, battle.id, request),
    ]);
    expect(view(results[0]).state.lastInputSequence).toBe(view(results[1]).state.lastInputSequence);
    const row = await prisma.alphaBattle.findUniqueOrThrow({ where: { id: battle.id } });
    expect((row.inputs as unknown[]).length).toBe(1);
    const projected = JSON.stringify(await service.read(guest, battle.id));
    expect(projected).not.toContain('rngState');
    expect(projected).not.toContain('"seed"');
    await expect(service.read(await player(), battle.id)).rejects.toMatchObject({ status: 404 });
  });
  it('runs CPU actions through the same engine until a result is reached', async () => {
    const id = await player(),
      selected = await deck(id, 'SWORD');
    let battle = view(
      await service.start(id, { mode: 'CPU', deckId: selected.id, cpuClass: 'SWORD' }),
    );
    for (let input = 0; input < 150 && battle.status !== 'COMPLETED'; input++) {
      const action =
        battle.legalActions.find((action) => action.type === 'PLAY_CARD') ??
        battle.legalActions.find((action) => action.type === 'END_TURN');
      expect(action).toBeDefined();
      battle = await act(id, battle, action!);
    }
    expect(battle.status).toBe('COMPLETED');
    expect(battle.result.status).toBe('WIN');
    const replay = (await service.replay(id, battle.id)) as {
      formatVersion: number;
      finalState: unknown;
    };
    expect(replay.formatVersion).toBe(3);
    expect(replay.finalState).toBeDefined();
    expect(verifyPlayerReplayViewV2(replay as PlayerReplayViewV2)).toEqual({ ok: true });
  }, 30000);
  it('expires a signed pending choice before accepting a late answer and verifies its replay', async () => {
    let now = Date.now();
    const timed = new AlphaBattleService(
      prisma,
      'complete-card-pool-integration-secret-32',
      () => now,
    );
    const host = await player(),
      guest = await player();
    const selected = await deck(host, 'TRICKSTER'),
      opposing = await deck(guest, 'GUARDIAN');
    const waiting = view(await timed.start(host, { mode: 'PRIVATE', deckId: selected.id }));
    await timed.join(guest, waiting.inviteCode, { deckId: opposing.id });
    let battle = view(await timed.read(host, waiting.id));
    for (let turn = 0; turn < 20; turn++) {
      const sleeve = battle.state.players
        .find((player) => player.id === host)!
        .hand.find((card) => card.definitionId === 'trickster_010');
      const play =
        sleeve &&
        battle.legalActions.find(
          (action) => action.type === 'PLAY_CARD' && action.cardInstanceId === sleeve.id,
        );
      if (play) {
        battle = view(
          await timed.action(host, battle.id, {
            requestId: randomUUID(),
            expectedSequence: battle.state.lastInputSequence,
            action: play,
          }),
        );
        break;
      }
      battle = view(
        await timed.action(host, battle.id, {
          requestId: randomUUID(),
          expectedSequence: battle.state.lastInputSequence,
          action: battle.legalActions.find((action) => action.type === 'END_TURN')!,
        }),
      );
      const enemy = view(await timed.read(guest, battle.id));
      await timed.action(guest, enemy.id, {
        requestId: randomUUID(),
        expectedSequence: enemy.state.lastInputSequence,
        action: enemy.legalActions.find((action) => action.type === 'END_TURN')!,
      });
      battle = view(await timed.read(host, battle.id));
    }
    const late = battle.legalActions.find((action) => action.type === 'SUBMIT_CARD_CHOICE');
    expect(late).toBeDefined();
    now += 61000;
    const expired = view(
      await timed.action(host, battle.id, {
        requestId: randomUUID(),
        expectedSequence: battle.state.lastInputSequence,
        action: late,
      }),
    );
    expect(expired.state.lastInputSequence).toBeGreaterThan(battle.state.lastInputSequence);
    const row = await prisma.alphaBattle.findUniqueOrThrow({ where: { id: battle.id } });
    expect(JSON.stringify(row.inputs)).toContain('CARD_CHOICE_TIMEOUT');
    expect(JSON.stringify(row.inputs)).not.toContain('SUBMIT_CARD_CHOICE');
    expect(
      verifyPlayerReplayViewV2((await timed.replay(host, battle.id)) as PlayerReplayViewV2),
    ).toEqual({ ok: true });
  }, 30000);
  it('connects Grand Wish special victory to PvP and the persisted replay', async () => {
    const host = await player(),
      guest = await player();
    const versionIds = [
      'mage_017',
      'mage_015',
      ...allCardDefinitions
        .filter((card) => card.class === 'GUARDIAN')
        .slice(0, 8)
        .map((card) => card.id),
    ];
    const versions = await prisma.cardVersion.findMany({
      where: { cardId: { in: versionIds }, version: '1.0.0' },
    });
    for (const version of versions)
      await prisma.playerCard.create({
        data: { playerId: host, cardVersionId: version.id, quantity: 3 },
      });
    const hostDeck = await prisma.deck.create({
      data: {
        playerId: host,
        name: randomUUID(),
        cardDataVersion: '1.0.0',
        cards: {
          create: versions.map((version, position) => ({
            cardVersionId: version.id,
            position,
            quantity: 3,
          })),
        },
      },
    });
    const guestDeck = await deck(guest, 'GUARDIAN');
    const waiting = view(await service.start(host, { mode: 'PRIVATE', deckId: hostDeck.id }));
    await service.join(guest, waiting.inviteCode, { deckId: guestDeck.id });
    let battle = view(await service.read(host, waiting.id));
    let wished = false;
    for (let turn = 0; turn < 20 && battle.status !== 'COMPLETED'; turn++) {
      const hand = battle.state.players.find((player) => player.id === host)!.hand;
      const card = hand.find((card) => card.definitionId === (wished ? 'mage_015' : 'mage_017'));
      const action =
        card &&
        battle.legalActions.find(
          (action) => action.type === 'PLAY_CARD' && action.cardInstanceId === card.id,
        );
      if (action) {
        battle = await act(host, battle, action);
        wished = true;
        if (battle.status === 'COMPLETED') break;
      }
      battle = await act(
        host,
        battle,
        battle.legalActions.find((action) => action.type === 'END_TURN')!,
      );
      let opposing = view(await service.read(guest, battle.id));
      opposing = await act(
        guest,
        opposing,
        opposing.legalActions.find((action) => action.type === 'END_TURN')!,
      );
      battle = view(await service.read(host, battle.id));
    }
    expect(battle.result).toMatchObject({
      status: 'WIN',
      reason: 'SPECIAL_VICTORY',
      specialVictoryId: 'MAGE_GRAND_WISH',
    });
    await expect(service.replay(host, battle.id)).resolves.toMatchObject({ formatVersion: 3 });
  }, 30000);
});
