import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { assertDevelopmentSeedEnvironment } from '../src/database/seed-environment.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

interface SeedFixture {
  readonly users: readonly { readonly email: string; readonly displayName: string }[];
  readonly cards: readonly {
    readonly id: string;
    readonly version: string;
    readonly definition: object;
  }[];
  readonly deck: {
    readonly id: string;
    readonly name: string;
    readonly cardDataVersion: string;
    readonly cards: readonly {
      readonly cardId: string;
      readonly version: string;
      readonly position: number;
      readonly quantity: number;
    }[];
  };
  readonly match: {
    readonly id: string;
    readonly status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    readonly engineVersion: string;
    readonly rulesVersion: string;
    readonly cardDataVersion: string;
    readonly seed: string;
    readonly initialState: object;
    readonly finalState: object;
    readonly checksum: string;
    readonly players: readonly {
      readonly email: string;
      readonly seat: number;
      readonly deckSnapshot: object;
    }[];
    readonly actions: readonly { readonly sequence: number; readonly action: object }[];
    readonly events: readonly { readonly sequence: number; readonly event: object }[];
    readonly snapshots: readonly {
      readonly actionIndex: number;
      readonly eventSequence: number;
      readonly state: object;
    }[];
  };
}

async function loadFixture(): Promise<SeedFixture> {
  const path = fileURLToPath(
    new URL('../../../tests/fixtures/database/development-seed.json', import.meta.url),
  );
  return JSON.parse(await readFile(path, 'utf8')) as SeedFixture;
}

async function main(): Promise<void> {
  assertDevelopmentSeedEnvironment();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required to run the development seed.');
  }

  const fixture = await loadFixture();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const players = new Map<string, string>();
    for (const userFixture of fixture.users) {
      const user = await prisma.user.upsert({
        where: { email: userFixture.email },
        update: { displayName: userFixture.displayName },
        create: userFixture,
      });
      const player = await prisma.player.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });
      players.set(userFixture.email, player.id);
    }

    const cardVersions = new Map<string, string>();
    for (const cardFixture of fixture.cards) {
      await prisma.card.upsert({
        where: { id: cardFixture.id },
        update: {},
        create: { id: cardFixture.id },
      });
      const cardVersion = await prisma.cardVersion.upsert({
        where: { cardId_version: { cardId: cardFixture.id, version: cardFixture.version } },
        update: { definition: cardFixture.definition },
        create: {
          cardId: cardFixture.id,
          version: cardFixture.version,
          definition: cardFixture.definition,
        },
      });
      cardVersions.set(`${cardFixture.id}:${cardFixture.version}`, cardVersion.id);
    }

    const debugPlayerId = players.get('debug@deckdrive.local');
    if (debugPlayerId === undefined)
      throw new Error('Development fixture must contain the debug user.');

    const deck = await prisma.deck.upsert({
      where: { id: fixture.deck.id },
      update: { name: fixture.deck.name, cardDataVersion: fixture.deck.cardDataVersion },
      create: {
        id: fixture.deck.id,
        playerId: debugPlayerId,
        name: fixture.deck.name,
        cardDataVersion: fixture.deck.cardDataVersion,
      },
    });

    for (const deckCard of fixture.deck.cards) {
      const cardVersionId = cardVersions.get(`${deckCard.cardId}:${deckCard.version}`);
      if (cardVersionId === undefined)
        throw new Error(`Missing card version for ${deckCard.cardId}.`);
      await prisma.playerCard.upsert({
        where: { playerId_cardVersionId: { playerId: debugPlayerId, cardVersionId } },
        update: { quantity: deckCard.quantity },
        create: { playerId: debugPlayerId, cardVersionId, quantity: deckCard.quantity },
      });
      await prisma.deckCard.upsert({
        where: { deckId_cardVersionId: { deckId: deck.id, cardVersionId } },
        update: { position: deckCard.position, quantity: deckCard.quantity },
        create: {
          deckId: deck.id,
          cardVersionId,
          position: deckCard.position,
          quantity: deckCard.quantity,
        },
      });
    }

    await prisma.match.upsert({
      where: { id: fixture.match.id },
      update: {
        status: fixture.match.status,
        engineVersion: fixture.match.engineVersion,
        rulesVersion: fixture.match.rulesVersion,
        cardDataVersion: fixture.match.cardDataVersion,
        seed: fixture.match.seed,
        initialState: fixture.match.initialState,
        finalState: fixture.match.finalState,
        checksum: fixture.match.checksum,
        completedAt: new Date(),
      },
      create: {
        id: fixture.match.id,
        status: fixture.match.status,
        engineVersion: fixture.match.engineVersion,
        rulesVersion: fixture.match.rulesVersion,
        cardDataVersion: fixture.match.cardDataVersion,
        seed: fixture.match.seed,
        initialState: fixture.match.initialState,
        finalState: fixture.match.finalState,
        checksum: fixture.match.checksum,
        completedAt: new Date(),
      },
    });

    for (const matchPlayer of fixture.match.players) {
      const playerId = players.get(matchPlayer.email);
      if (playerId === undefined) throw new Error(`Missing player for ${matchPlayer.email}.`);
      await prisma.matchPlayer.upsert({
        where: { matchId_playerId: { matchId: fixture.match.id, playerId } },
        update: { seat: matchPlayer.seat, deckSnapshot: matchPlayer.deckSnapshot },
        create: {
          matchId: fixture.match.id,
          playerId,
          seat: matchPlayer.seat,
          deckSnapshot: matchPlayer.deckSnapshot,
        },
      });
    }

    for (const action of fixture.match.actions) {
      await prisma.matchAction.upsert({
        where: { matchId_sequence: { matchId: fixture.match.id, sequence: action.sequence } },
        update: { action: action.action },
        create: { matchId: fixture.match.id, sequence: action.sequence, action: action.action },
      });
    }
    for (const event of fixture.match.events) {
      await prisma.matchEvent.upsert({
        where: { matchId_sequence: { matchId: fixture.match.id, sequence: event.sequence } },
        update: { event: event.event },
        create: { matchId: fixture.match.id, sequence: event.sequence, event: event.event },
      });
    }
    for (const snapshot of fixture.match.snapshots) {
      await prisma.matchSnapshot.upsert({
        where: {
          matchId_actionIndex: { matchId: fixture.match.id, actionIndex: snapshot.actionIndex },
        },
        update: { eventSequence: snapshot.eventSequence, state: snapshot.state },
        create: {
          matchId: fixture.match.id,
          actionIndex: snapshot.actionIndex,
          eventSequence: snapshot.eventSequence,
          state: snapshot.state,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
