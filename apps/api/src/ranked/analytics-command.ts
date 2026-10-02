import { PrismaPg } from '@prisma/adapter-pg';
import { loadRootEnvironment } from '../database/load-environment.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaRankedAnalytics } from './prisma-analytics.js';

loadRootEnvironment();
const databaseUrl = process.env.DATABASE_URL;
const operatorId = process.env.RANKED_ANALYTICS_OPERATOR;
if (!databaseUrl || !operatorId?.trim())
  throw new Error('DATABASE_URL and RANKED_ANALYTICS_OPERATOR are required.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const analytics = new PrismaRankedAnalytics(prisma);
const [command, id, requestId, status, ...noteParts] = process.argv.slice(2);
try {
  let result: unknown;
  if (command === 'report' && id) result = await analytics.report(id);
  else if (command === 'scan' && id) result = await analytics.scan(id);
  else if (command === 'flags' && id) result = await analytics.flags(id);
  else if (
    command === 'review' &&
    id &&
    requestId &&
    (status === 'OPEN' || status === 'DISMISSED' || status === 'CONFIRMED')
  )
    result = await analytics.review(id, requestId, operatorId, status, noteParts.join(' '));
  else
    throw new Error(
      'Usage: ranked:analytics <report|scan|flags> <season-id> OR review <flag-id> <request-id> <OPEN|DISMISSED|CONFIRMED> <note>',
    );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
