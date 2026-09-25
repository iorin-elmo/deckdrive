import { type Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { PrismaCosmeticService } from '../cosmetics/prisma-cosmetic-service.js';
import { PrismaPackOpeningService } from '../packs/prisma-pack-opening.js';
import {
  PrismaRewardLedger,
  PrismaRewardLedgerOperations,
} from '../rewards/prisma-reward-ledger.js';
import { RewardService, type RewardGrant } from '../rewards/reward-ledger.js';
import { loginRewardForCycleDay, type LoginReward, type MissionMetric } from './catalog.js';
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
  | 'packOpening'
  | 'cardVersion'
  | 'playerCard'
  | '$queryRaw'
>;
type MissionClient = MissionOperations & Pick<PrismaClient, '$transaction'>;

export class MissionNotFoundError extends Error {}
export class MissionNotReadyError extends Error {}
export class LoginRewardConfigurationError extends Error {}

/**
 * Server-side mission rewards. Progress has no public HTTP mutation: battle services invoke
 * `recordProgress` only after an authoritative game event has been persisted.
 */
export class PrismaMissionService {
  private readonly rewards: RewardService;

  constructor(private readonly prisma: MissionClient) {
    this.rewards = new RewardService(new PrismaRewardLedger(prisma));
  }

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
      const rewardGrant: RewardGrant = {
        playerId,
        currency: mission.rewardCurrency,
        amount: mission.rewardAmount,
        reason: `MISSION:${missionId}`,
        idempotencyKey,
      };
      if (claimed.count !== 1) {
        const existingClaim = await transaction.playerMission.findUnique({
          where: {
            playerId_missionId_periodStart: { playerId, missionId, periodStart },
          },
        });
        if (existingClaim === null || existingClaim.claimedAt === null)
          throw new MissionNotReadyError('Mission is not complete or was claimed.');
        const reward = await this.grantRewardInTransaction(transaction, rewardGrant);
        return { missionId, claimedAt: existingClaim.claimedAt, reward };
      }
      const reward = await this.grantRewardInTransaction(transaction, rewardGrant);
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
        const reward = await this.grantLoginReward(
          transaction,
          playerId,
          day,
          existing.cycleDay,
          loginRewardFromJson(existing.reward),
        );
        return { claim: existing, reward, alreadyClaimed: true };
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
        create: {
          playerId,
          day,
          cycleDay: cycle.cycleDay,
          reward: toJson(rewardDefinition),
          claimedAt: now,
        },
      });
      const reward = await this.grantLoginReward(
        transaction,
        playerId,
        day,
        cycle.cycleDay,
        rewardDefinition,
      );
      return { claim, reward, alreadyClaimed: false };
    });
  }

  private async grantLoginReward(
    transaction: MissionOperations,
    playerId: string,
    day: Date,
    cycleDay: number,
    reward: LoginReward,
  ) {
    return this.grantLoginRewardDefinition(transaction, playerId, day, cycleDay, reward);
  }

  private async grantLoginRewardDefinition(
    transaction: MissionOperations,
    playerId: string,
    day: Date,
    cycleDay: number,
    reward: LoginReward,
  ) {
    const idempotencyPrefix = `login:${day.toISOString()}`;
    // Before the reward snapshot column existed, the claim and all of its grants committed in
    // one transaction. Retrying that completed claim must succeed without issuing a new reward.
    if (reward.kind === 'LEGACY') return { kind: reward.kind };
    if (reward.kind === 'CURRENCY') {
      const grant = await this.grantRewardInTransaction(transaction, {
        playerId,
        currency: reward.currency,
        amount: reward.amount,
        reason: `LOGIN_DAY:${String(cycleDay)}`,
        idempotencyKey: idempotencyPrefix,
      });
      return { kind: reward.kind, currency: grant.currency, amount: grant.amount };
    }
    if (reward.kind === 'PACK') {
      const opening = await new PrismaPackOpeningService(this.prisma).grantInTransaction(
        transaction,
        {
          playerId,
          productId: reward.productId,
          idempotencyKey: `${idempotencyPrefix}:pack`,
        },
      );
      return { kind: reward.kind, productId: reward.productId, opening };
    }
    const cosmetic = await new PrismaCosmeticService(this.prisma).grantInTransaction(transaction, {
      playerId,
      cosmeticId: reward.cosmeticId,
      source: `LOGIN_DAY:${String(cycleDay)}`,
      idempotencyKey: `${idempotencyPrefix}:cosmetic`,
    });
    return { kind: reward.kind, cosmetic };
  }

  private grantRewardInTransaction(transaction: MissionOperations, grant: RewardGrant) {
    return this.rewards.grantInTransaction(new PrismaRewardLedgerOperations(transaction), grant);
  }
}

function loginRewardFromJson(value: Prisma.JsonValue): LoginReward {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new LoginRewardConfigurationError('Stored login reward is invalid.');
  if (value.kind === 'LEGACY') return { kind: value.kind };
  if (
    value.kind === 'CURRENCY' &&
    (value.currency === 'GEM' || value.currency === 'EXCHANGE_POINT') &&
    typeof value.amount === 'number' &&
    Number.isInteger(value.amount) &&
    value.amount > 0
  )
    return { kind: value.kind, currency: value.currency, amount: value.amount };
  if (
    value.kind === 'PACK' &&
    (value.productId === 'NORMAL_PACK' || value.productId === 'RARE_PACK')
  )
    return { kind: value.kind, productId: value.productId };
  if (value.kind === 'COSMETIC' && typeof value.cosmeticId === 'string')
    return { kind: value.kind, cosmeticId: value.cosmeticId };
  throw new LoginRewardConfigurationError('Stored login reward is invalid.');
}

function toJson(value: LoginReward): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
