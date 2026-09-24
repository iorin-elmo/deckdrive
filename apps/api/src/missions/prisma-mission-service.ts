import type { PrismaClient } from '../generated/prisma/client.js';
import { loginRewardForCycleDay, type MissionMetric } from './catalog.js';
import { missionPeriodStart, nextLoginCycle } from './progression.js';

type MissionOperations = Pick<
  PrismaClient,
  'mission' | 'playerMission' | 'loginRewardClaim' | 'currencyTransaction'
>;
type MissionClient = MissionOperations & Pick<PrismaClient, '$transaction'>;

export class MissionNotFoundError extends Error {}
export class MissionNotReadyError extends Error {}

/**
 * Server-side mission rewards. Progress has no public HTTP mutation: battle services invoke
 * `recordProgress` only after an authoritative game event has been persisted.
 */
export class PrismaMissionService {
  constructor(private readonly prisma: MissionClient) {}

  async list(playerId: string, now = new Date()) {
    const definitions = await this.prisma.mission.findMany({
      where: { active: true },
      orderBy: [{ cadence: 'asc' }, { id: 'asc' }],
    });
    const periods = [...new Set(definitions.map((definition) => definition.cadence))].map(
      (cadence) => missionPeriodStart(cadence, now),
    );
    const progress = await this.prisma.playerMission.findMany({
      where: { playerId, periodStart: { in: periods } },
    });
    return definitions.map((definition) => {
      const periodStart = missionPeriodStart(definition.cadence, now);
      const entry = progress.find(
        (candidate) =>
          candidate.missionId === definition.id &&
          candidate.periodStart.valueOf() === periodStart.valueOf(),
      );
      return {
        id: definition.id,
        cadence: definition.cadence,
        metric: definition.metric,
        target: definition.target,
        progress: entry?.progress ?? 0,
        claimedAt: entry?.claimedAt ?? null,
        periodStart,
        reward: { currency: definition.rewardCurrency, amount: definition.rewardAmount },
      };
    });
  }

  async claim(playerId: string, missionId: string, now = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const mission = await transaction.mission.findFirst({
        where: { id: missionId, active: true },
      });
      if (mission === null) throw new MissionNotFoundError('Mission was not found.');
      const periodStart = missionPeriodStart(mission.cadence, now);
      const claimed = await transaction.playerMission.updateMany({
        where: {
          playerId,
          missionId,
          periodStart,
          claimedAt: null,
          progress: { gte: mission.target },
        },
        data: { claimedAt: now },
      });
      if (claimed.count !== 1)
        throw new MissionNotReadyError('Mission is not complete or was claimed.');
      const idempotencyKey = `mission:${missionId}:${periodStart.toISOString()}`;
      const reward = await transaction.currencyTransaction.upsert({
        where: { playerId_idempotencyKey: { playerId, idempotencyKey } },
        update: {},
        create: {
          playerId,
          currency: mission.rewardCurrency,
          amount: mission.rewardAmount,
          reason: `MISSION:${missionId}`,
          idempotencyKey,
        },
      });
      return { missionId, claimedAt: now, reward };
    });
  }

  async recordProgress(playerId: string, metric: MissionMetric, amount: number, now = new Date()) {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new Error('Mission progress must be positive.');
    return this.prisma.$transaction((transaction) =>
      this.recordProgressInTransaction(transaction, playerId, metric, amount, now),
    );
  }

  /** Allows an authoritative match event and its mission progress to commit atomically. */
  async recordProgressInTransaction(
    transaction: MissionOperations,
    playerId: string,
    metric: MissionMetric,
    amount: number,
    now = new Date(),
  ) {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new Error('Mission progress must be positive.');
    const definitions = await transaction.mission.findMany({ where: { active: true, metric } });
    return Promise.all(
      definitions.map(async (mission) => {
        const periodStart = missionPeriodStart(mission.cadence, now);
        const existing = await transaction.playerMission.findUnique({
          where: {
            playerId_missionId_periodStart: { playerId, missionId: mission.id, periodStart },
          },
        });
        if (existing?.claimedAt !== null && existing !== null) return existing;
        return transaction.playerMission.upsert({
          where: {
            playerId_missionId_periodStart: { playerId, missionId: mission.id, periodStart },
          },
          update: { progress: Math.min(mission.target, (existing?.progress ?? 0) + amount) },
          create: {
            playerId,
            missionId: mission.id,
            periodStart,
            progress: Math.min(mission.target, amount),
          },
        });
      }),
    );
  }

  async claimLoginReward(playerId: string, now = new Date()) {
    const day = missionPeriodStart('DAILY', now);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.loginRewardClaim.findUnique({
        where: { playerId_day: { playerId, day } },
      });
      if (existing !== null) return { claim: existing, alreadyClaimed: true };
      const previous = await transaction.loginRewardClaim.findFirst({
        where: { playerId },
        orderBy: { day: 'desc' },
      });
      const cycle = nextLoginCycle(
        now,
        previous === null
          ? undefined
          : {
              day: previous.day.toISOString().slice(0, 'YYYY-MM-DD'.length),
              cycleDay: previous.cycleDay,
            },
      );
      const rewardDefinition = loginRewardForCycleDay(cycle.cycleDay).reward;
      const claim = await transaction.loginRewardClaim.upsert({
        where: { playerId_day: { playerId, day } },
        update: {},
        create: { playerId, day, cycleDay: cycle.cycleDay, claimedAt: now },
      });
      const idempotencyKey = `login:${day.toISOString()}`;
      const reward = await transaction.currencyTransaction.upsert({
        where: { playerId_idempotencyKey: { playerId, idempotencyKey } },
        update: {},
        create: {
          playerId,
          currency: rewardDefinition.currency,
          amount: rewardDefinition.amount,
          reason: `LOGIN_DAY:${String(cycle.cycleDay)}`,
          idempotencyKey,
        },
      });
      return { claim, reward, alreadyClaimed: false };
    });
  }
}
