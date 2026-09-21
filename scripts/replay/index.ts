import { PrismaPg } from '@prisma/adapter-pg';
import { loadRootEnvironment } from '../../apps/api/src/database/load-environment.js';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { MatchReplayRepository } from '../../apps/api/src/matches/replay-repository.js';
import { parseReplayMatchId } from '../../apps/api/src/replay/command.js';

export async function run(arguments_: readonly string[]): Promise<string> {
  const matchId = parseReplayMatchId(arguments_);
  loadRootEnvironment();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required to load a persisted replay.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const replay = await new MatchReplayRepository(prisma).load(matchId);
    return JSON.stringify(replay, null, 2);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    process.stdout.write(`${await run(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
