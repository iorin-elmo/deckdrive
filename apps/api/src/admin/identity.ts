import type { PrismaClient } from '../generated/prisma/client.js';

/** This is the only identity allowed to acquire an administrator role. */
export const discordOwnerId = '387855958627450881';
export type AdminRole = 'OWNER';

export async function adminRoleForUser(
  prisma: Pick<PrismaClient, 'oAuthAccount'>,
  userId: string,
): Promise<AdminRole | null> {
  const account = await prisma.oAuthAccount.findUnique({
    where: { userId_provider: { userId, provider: 'DISCORD' } },
    select: { providerUserId: true },
  });
  return account?.providerUserId === discordOwnerId ? 'OWNER' : null;
}
