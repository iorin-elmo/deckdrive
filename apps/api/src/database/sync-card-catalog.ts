import { PrismaPg } from '@prisma/adapter-pg';
import { allCardDefinitions } from '@deck-drive/card-definitions';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { loadRootEnvironment } from './load-environment.js';

loadRootEnvironment();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw Error('DATABASE_URL is required.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await prisma.$transaction(async (tx) => {
    for (const definition of allCardDefinitions) {
      await tx.card.upsert({
        where: { id: definition.id },
        create: { id: definition.id },
        update: {},
      });
      await tx.cardVersion.upsert({
        where: { cardId_version: { cardId: definition.id, version: definition.version } },
        create: {
          cardId: definition.id,
          version: definition.version,
          definition: JSON.parse(JSON.stringify(definition)) as Prisma.InputJsonValue,
        },
        update: {},
      });
    }
  });
  process.stdout.write(`Card catalog synchronized: ${allCardDefinitions.length} definitions.\n`);
} finally {
  await prisma.$disconnect();
}
