import { allCardDefinitions } from '@deck-drive/card-definitions';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { adminRoleForUser } from '../admin/identity.js';
import { AlphaBattleError } from '../battles/alpha-service.js';
import { lockPlayerForUpdate } from '../missions/prisma-progression-service.js';

export const exchangeCosts: Readonly<Record<string, number>> = {
  N: 25,
  R: 75,
  SR: 250,
  SSR: 750,
  UR: 2500,
};
export async function grantAdminCollection(prisma: PrismaClient, playerId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { userId: true },
  });
  if (!player || !(await adminRoleForUser(prisma, player.userId))) return;
  const owned = await prisma.playerCard.findMany({
    where: { playerId },
    include: { cardVersion: { select: { cardId: true, version: true } } },
  });
  if (
    allCardDefinitions.every((definition) =>
      owned.some(
        (entry) =>
          entry.cardVersion.cardId === definition.id &&
          entry.cardVersion.version === definition.version &&
          entry.quantity >= Math.min(3, definition.deckLimit ?? 3),
      ),
    )
  )
    return;
  await prisma.$transaction(async (tx) => {
    await lockPlayerForUpdate(tx, playerId);
    for (const definition of allCardDefinitions) {
      const version = await tx.cardVersion.findUnique({
        where: { cardId_version: { cardId: definition.id, version: definition.version } },
      });
      if (!version) continue;
      const quantity = Math.min(3, definition.deckLimit ?? 3);
      const previous = await tx.playerCard.findUnique({
        where: { playerId_cardVersionId: { playerId, cardVersionId: version.id } },
      });
      if ((previous?.quantity ?? 0) >= quantity) continue;
      await tx.playerCard.upsert({
        where: { playerId_cardVersionId: { playerId, cardVersionId: version.id } },
        create: { playerId, cardVersionId: version.id, quantity },
        update: { quantity },
      });
      await tx.adminAction.create({
        data: {
          adminUserId: player.userId,
          requestId: `entitlement:${randomUUID()}`,
          action: 'ADMIN_CARD_ENTITLEMENT',
          target: `player:${playerId}:card:${version.id}`,
          payloadHash: createHash('sha256')
            .update(JSON.stringify({ playerId, cardVersionId: version.id, quantity }))
            .digest('hex'),
          before: { quantity: previous?.quantity ?? 0 },
          after: { quantity },
          reason: '全カード対戦用のAdmin所持上限補充',
        },
      });
    }
  });
}
export async function exchangeCard(
  prisma: PrismaClient,
  playerId: string,
  cardVersionId: string,
  key: string,
): Promise<unknown> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(cardVersionId))
    throw new AlphaBattleError(400, 'INVALID_CARD_VERSION_ID');
  if (!/^[a-zA-Z0-9:-]{1,100}$/u.test(key))
    throw new AlphaBattleError(400, 'INVALID_IDEMPOTENCY_KEY');
  return prisma.$transaction(async (tx) => {
    await lockPlayerForUpdate(tx, playerId);
    const idempotencyKey = `card-exchange:${key}`;
    const prior = await tx.currencyTransaction.findUnique({
      where: { playerId_idempotencyKey: { playerId, idempotencyKey } },
    });
    if (prior) {
      if (prior.referenceId !== cardVersionId)
        throw new AlphaBattleError(409, 'IDEMPOTENCY_CONFLICT');
      return { cardVersionId, spent: -prior.amount };
    }
    const version = await tx.cardVersion.findUnique({ where: { id: cardVersionId } });
    const definition =
      version &&
      allCardDefinitions.find(
        (card) => card.id === version.cardId && card.version === version.version,
      );
    if (!version || !definition) throw new AlphaBattleError(404, 'CARD_NOT_FOUND');
    const cost = exchangeCosts[definition.rarity];
    if (cost === undefined) throw new AlphaBattleError(400, 'CARD_NOT_EXCHANGEABLE');
    const owned = await tx.playerCard.findUnique({
      where: { playerId_cardVersionId: { playerId, cardVersionId } },
    });
    if ((owned?.quantity ?? 0) >= Math.min(3, definition.deckLimit ?? 3))
      throw new AlphaBattleError(409, 'CARD_COPY_LIMIT');
    const balance = await tx.currencyTransaction.aggregate({
      where: { playerId, currency: 'EXCHANGE_POINT' },
      _sum: { amount: true },
    });
    if ((balance._sum.amount ?? 0) < cost)
      throw new AlphaBattleError(409, 'INSUFFICIENT_EXCHANGE_POINTS');
    await tx.currencyTransaction.create({
      data: {
        playerId,
        currency: 'EXCHANGE_POINT',
        amount: -cost,
        reason: 'CARD_EXCHANGE',
        referenceId: cardVersionId,
        idempotencyKey,
      },
    });
    await tx.playerCard.upsert({
      where: { playerId_cardVersionId: { playerId, cardVersionId } },
      create: { playerId, cardVersionId, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    return { cardVersionId, spent: cost };
  });
}
