import type { PrismaClient } from '../generated/prisma/client.js';
import { loginCosmeticForCycleDay } from '../cosmetics/catalog.js';
import { PrismaCosmeticService } from '../cosmetics/prisma-cosmetic-service.js';
import { RewardValidationError } from '../rewards/reward-ledger.js';
import { loginRewardForCycleDay, type MissionMetric } from './catalog.js';
import { missionPeriodStart, nextLoginCycle } from './progression.js';
import { lockPlayerForUpdate } from './prisma-progression-service.js';

type MissionOperations = Pick<
  PrismaClient,
  | 'mission'
  | 'playerMission'
  | 'loginRewardClaim'
  | 'currencyTransaction'
  | 'cosmetic'
  | 'cosmeticGrant'
  | 'playerCosmetic'
  | '$queryRaw'
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
      await lockPlayerForUpdate(transaction, playerId);
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
      const idempotencyKey = `mission:${missionId}:${periodStart.toISOString()}`;
      if (claimed.count !== 1) {
        const existingClaim = await transaction.playerMission.findUnique({
          where: {
            playerId_missionId_periodStart: { playerId, missionId, periodStart },
          },
        });
        if (existingClaim === null || existingClaim.claimedAt === null)
          throw new MissionNotReadyError('Mission is not complete or was claimed.');
        const reward = await transaction.currencyTransaction.findUnique({
          where: { playerId_idempotencyKey: { playerId, idempotencyKey } },
        });
        assertMissionReward(reward, mission.rewardCurrency, mission.rewardAmount, missionId);
        return { missionId, claimedAt: existingClaim.claimedAt, reward };
      }
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
      assertMissionReward(reward, mission.rewardCurrency, mission.rewardAmount, missionId);
      return { missionId, claimedAt: now, reward };
    });
  }

  async recordProgress(playerId: string, metric: MissionMetric, amount: number, now = new Date()) {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new Error('Mission progress must be positive.');
    return this.prisma.$transaction(async (transaction) => {
      await lockPlayerForUpdate(transaction, playerId);
      return this.recordProgressInTransaction(transaction, playerId, metric, amount, now);
    });
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
        if (existing !== null && existing.claimedAt !== null) return existing;
        const progress = await transaction.playerMission.upsert({
          where: {
            playerId_missionId_periodStart: { playerId, missionId: mission.id, periodStart },
          },
          // Prisma emits an atomic SQL increment, so simultaneous server events cannot lose progress.
          update: { progress: { increment: amount } },
          create: {
            playerId,
            missionId: mission.id,
            periodStart,
            progress: Math.min(mission.target, amount),
          },
        });
        if (progress.progress <= mission.target) return progress;
        return transaction.playerMission.update({
          where: {
            playerId_missionId_periodStart: { playerId, missionId: mission.id, periodStart },
          },
          data: { progress: mission.target },
        });
      }),
    );
  }

  async claimLoginReward(playerId: string, now = new Date()) {
    const day = missionPeriodStart('DAILY', now);
    return this.prisma.$transaction(async (transaction) => {
      // A player row lock serializes adjacent UTC-day claims. Without it, a day D+1
      // request could calculate its cycle before an in-flight day D claim commits.
      await lockPlayerForUpdate(transaction, playerId);
      const existing = await transaction.loginRewardClaim.findUnique({
        where: { playerId_day: { playerId, day } },
      });
      if (existing !== null) {
        const rewardDefinition = loginRewardForCycleDay(existing.cycleDay).reward;
        const reward = await transaction.currencyTransaction.findUnique({
          where: {
            playerId_idempotencyKey: { playerId, idempotencyKey: `login:${day.toISOString()}` },
          },
        });
        assertLoginReward(
          reward,
          rewardDefinition.currency,
          rewardDefinition.amount,
          existing.cycleDay,
        );
        const cosmetic = await this.grantLoginCosmetic(
          transaction,
          playerId,
          day,
          existing.cycleDay,
        );
        return { claim: existing, reward, cosmetic, alreadyClaimed: true };
      }
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
      assertLoginReward(reward, rewardDefinition.currency, rewardDefinition.amount, cycle.cycleDay);
      const cosmetic = await this.grantLoginCosmetic(transaction, playerId, day, cycle.cycleDay);
      return { claim, reward, cosmetic, alreadyClaimed: false };
    });
  }

  private async grantLoginCosmetic(
    transaction: MissionOperations,
    playerId: string,
    day: Date,
    cycleDay: number,
  ) {
    const cosmeticId = loginCosmeticForCycleDay(cycleDay);
    if (cosmeticId === undefined) return null;
    return new PrismaCosmeticService(this.prisma).grantInTransaction(transaction, {
      playerId,
      cosmeticId,
      source: `LOGIN_DAY:${String(cycleDay)}`,
      idempotencyKey: `login:${day.toISOString()}:cosmetic`,
    });
  }
}

function assertLoginReward(
  reward: { readonly currency: string; readonly amount: number; readonly reason: string } | null,
  currency: string,
  amount: number,
  cycleDay: number,
): asserts reward is {
  readonly currency: string;
  readonly amount: number;
  readonly reason: string;
} {
  if (
    reward === null ||
    reward.currency !== currency ||
    reward.amount !== amount ||
    reward.reason !== `LOGIN_DAY:${String(cycleDay)}`
  )
    throw new RewardValidationError(
      'Login reward idempotency key was used for a different reward.',
    );
}

function assertMissionReward(
  reward: { readonly currency: string; readonly amount: number; readonly reason: string } | null,
  currency: string,
  amount: number,
  missionId: string,
): void {
  if (
    reward === null ||
    reward.currency !== currency ||
    reward.amount !== amount ||
    reward.reason !== `MISSION:${missionId}`
  )
    throw new RewardValidationError(
      'Mission reward idempotency key was used for a different reward.',
    );
}
