import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  buildRankedReport,
  detectAbuseSignals,
  type PackFact,
  type RankedMatchFact,
  type RankedPlayerFact,
} from './analytics.js';

type Reader = Prisma.TransactionClient;

/** Operator-only adapter. No public HTTP route calls this service. */
export class PrismaRankedAnalytics {
  constructor(private readonly prisma: PrismaClient) {}

  async report(seasonId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const season = await tx.season.findUnique({ where: { id: seasonId } });
        if (season === null) throw new Error('SEASON_NOT_FOUND');
        const facts = await loadMatchFacts(tx, seasonId);
        const openings = await tx.packOpening.findMany({
          where: { createdAt: { gte: season.startsAt, lt: season.endsAt } },
          select: { id: true, product: true, result: true },
        });
        const packs = openings.map((opening): PackFact => {
          const result = record(opening.result);
          const cards = Array.isArray(result?.cards) ? result.cards : [];
          const grants = Array.isArray(result?.grants) ? result.grants : [];
          return {
            openingId: opening.id,
            product: opening.product,
            rarities: cards.flatMap((card) => {
              const rarity = record(card)?.rarity;
              return typeof rarity === 'string' ? [rarity] : [];
            }),
            duplicateCount: grants.reduce<number>((sum, grant) => {
              const converted = record(grant)?.converted;
              return (
                sum +
                (typeof converted === 'number' && Number.isInteger(converted) && converted > 0
                  ? converted
                  : 0)
              );
            }, 0),
          };
        });
        return { seasonId, ...buildRankedReport(facts, packs) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async scan(seasonId: string): Promise<{ detected: number; inserted: number }> {
    const signals = await this.prisma.$transaction(
      async (tx) => {
        if (
          (await tx.season.findUnique({ where: { id: seasonId }, select: { id: true } })) === null
        )
          throw new Error('SEASON_NOT_FOUND');
        return detectAbuseSignals(await loadMatchFacts(tx, seasonId));
      },
      { isolationLevel: 'RepeatableRead' },
    );
    let inserted = 0;
    for (let offset = 0; offset < signals.length; offset += 500) {
      const batch = signals.slice(offset, offset + 500);
      const result = await this.prisma.ratingAbuseFlag.createMany({
        data: batch.map((signal) => ({
          matchId: signal.matchId,
          playerId: signal.playerId,
          type: signal.type,
          evidence: signal.evidence as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }
    return { detected: signals.length, inserted };
  }

  async flags(seasonId: string) {
    return this.prisma.ratingAbuseFlag.findMany({
      where: { match: { rankedMatch: { seasonId } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        matchId: true,
        playerId: true,
        type: true,
        evidence: true,
        status: true,
        reviews: {
          orderBy: { createdAt: 'asc' },
          select: {
            operatorId: true,
            previousStatus: true,
            nextStatus: true,
            note: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async review(
    flagId: string,
    operatorId: string,
    status: 'OPEN' | 'DISMISSED' | 'CONFIRMED',
    note: string,
  ) {
    if (
      operatorId.trim().length === 0 ||
      operatorId.length > 100 ||
      note.trim().length === 0 ||
      note.length > 2000
    )
      throw new Error('INVALID_REVIEW');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rating_abuse_flags WHERE id = ${flagId}::uuid FOR UPDATE`;
      const flag = await tx.ratingAbuseFlag.findUnique({ where: { id: flagId } });
      if (flag === null) throw new Error('FLAG_NOT_FOUND');
      const latest = await tx.ratingAbuseReview.findFirst({
        where: { flagId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (
        flag.status === status &&
        latest?.operatorId === operatorId &&
        latest.nextStatus === status &&
        latest.note === note
      )
        return latest;
      await tx.ratingAbuseFlag.update({ where: { id: flagId }, data: { status } });
      return tx.ratingAbuseReview.create({
        data: { flagId, operatorId, previousStatus: flag.status, nextStatus: status, note },
      });
    });
  }
}

async function loadMatchFacts(tx: Reader, seasonId: string): Promise<readonly RankedMatchFact[]> {
  const matches = await tx.match.findMany({
    where: { rankedMatch: { seasonId }, status: { in: ['COMPLETED', 'ABANDONED'] } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      finalState: true,
      players: {
        orderBy: { seat: 'asc' },
        select: { playerId: true, deckSnapshot: true, disconnectCount: true },
      },
      actions: { select: { source: true, action: true } },
      events: { select: { event: true } },
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
  });
  const histories = await tx.ratingHistory.findMany({
    where: { seasonId },
    select: { matchId: true, playerId: true, outcome: true, damageRatio: true, delta: true },
  });
  const byMatch = new Map<string, typeof histories>();
  for (const history of histories)
    byMatch.set(history.matchId, [...(byMatch.get(history.matchId) ?? []), history]);
  return matches.flatMap((match): RankedMatchFact[] => {
    if (match.completedAt === null || match.players.length !== 2) return [];
    const history = byMatch.get(match.id) ?? [];
    // A half-written settlement must never be treated as a completed result.
    if (match.status === 'COMPLETED' && history.length !== 2) return [];
    const players = match.players.map((player): RankedPlayerFact => {
      const rating = history.find((entry) => entry.playerId === player.playerId);
      const deck = deckUsage(player.deckSnapshot);
      return {
        playerId: player.playerId,
        outcome: rating?.outcome ?? null,
        damageRatio: rating?.damageRatio ?? null,
        ratingDelta: rating?.delta ?? null,
        disconnectCount: player.disconnectCount,
        ...deck,
      };
    }) as [RankedPlayerFact, RankedPlayerFact];
    return [
      {
        matchId: match.id,
        seasonId,
        startedAt: match.createdAt,
        completedAt: match.completedAt,
        status: match.status as RankedMatchFact['status'],
        turnCount: terminalTurnCount(
          match.finalState,
          match.events.map((entry) => entry.event),
        ),
        forfeitReason: verifiedForfeitReason(
          match.actions,
          match.events.map((entry) => entry.event),
        ),
        players,
      },
    ];
  });
}

function verifiedForfeitReason(
  actions: readonly { readonly source: string; readonly action: unknown }[],
  events: readonly unknown[],
): RankedMatchFact['forfeitReason'] {
  const forfeits = actions.filter(
    (entry) => entry.source === 'FORFEIT' || record(entry.action)?.type === 'FORFEIT',
  );
  const forfeitedEvents = events.filter((event) => record(event)?.type === 'PLAYER_FORFEITED');
  if (forfeits.length === 0 && forfeitedEvents.length === 0) return null;
  if (forfeits.length !== 1 || forfeitedEvents.length !== 1)
    throw new Error('RANKED_FORFEIT_REPLAY_MISMATCH');
  const action = record(forfeits[0]?.action);
  const event = record(forfeitedEvents[0]);
  const reason = action?.reason;
  if (
    forfeits[0]?.source !== 'FORFEIT' ||
    action?.type !== 'FORFEIT' ||
    (reason !== 'SURRENDER' && reason !== 'DISCONNECT' && reason !== 'TIMEOUT') ||
    event?.reason !== reason ||
    event.playerId !== action.playerId
  )
    throw new Error('RANKED_FORFEIT_REPLAY_MISMATCH');
  return reason;
}

function terminalTurnCount(finalState: unknown, events: readonly unknown[]): number {
  const turn = record(finalState)?.turn;
  if (typeof turn === 'number' && Number.isSafeInteger(turn) && turn > 0) return turn;
  return events.filter((event) => record(event)?.type === 'TURN_ENDED').length + 1;
}

function deckUsage(value: unknown): Pick<RankedPlayerFact, 'deckKey' | 'classes' | 'cards'> {
  const snapshot = record(value);
  const entries = Array.isArray(snapshot?.cards) ? snapshot.cards : [];
  const cards: string[] = [];
  const classes: string[] = [];
  const fingerprint: string[] = [];
  for (const entry of entries) {
    const row = record(entry);
    const version = record(row?.cardVersion);
    const definition = record(version?.definition);
    const id = definition?.id;
    const cardClass = definition?.class;
    if (typeof id !== 'string') continue;
    const versionLabel = typeof version?.version === 'string' ? `${id}@${version.version}` : id;
    cards.push(versionLabel);
    if (typeof cardClass === 'string' && cardClass !== 'NEUTRAL') classes.push(cardClass);
    fingerprint.push(
      `${typeof version?.id === 'string' ? version.id : versionLabel}:${String(row?.quantity ?? 1)}`,
    );
  }
  return {
    deckKey:
      fingerprint.length === 0
        ? null
        : createHash('sha256').update(fingerprint.sort().join('|')).digest('hex').slice(0, 16),
    classes: [...new Set(classes)],
    cards: [...new Set(cards)],
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
