export interface RatingConfig {
  readonly kValues: {
    readonly provisional: number;
    readonly regular: number;
    readonly veteran: number;
  };
  /** Inclusive upper bounds on completed ranked games before this match. */
  readonly provisionalGames: number;
  readonly regularGames: number;
  readonly maxLossScore: number;
  readonly lossDamageWeight: number;
}

export const defaultRatingConfig: RatingConfig = {
  kValues: { provisional: 40, regular: 28, veteran: 20 },
  provisionalGames: 20,
  regularGames: 100,
  maxLossScore: 0.45,
  lossDamageWeight: 0.45,
};

export interface RatingInput {
  readonly rating: number;
  readonly opponentRating: number;
  readonly completedGames: number;
  readonly outcome: 'WIN' | 'LOSS' | 'DRAW';
  /** Derived from server replay events, never supplied by a client. */
  readonly damageDealt: number;
  readonly opponentInitialHp: number;
}

export interface LossPerformanceInput {
  readonly damageRatio: number;
  readonly damageDealt: number;
  readonly opponentInitialHp: number;
}

/** Allows future board and resource metrics without changing Elo calculation. */
export interface PerformanceStrategy {
  lossScore(input: LossPerformanceInput, config: RatingConfig): number;
}

export const damagePerformanceStrategy: PerformanceStrategy = {
  lossScore: ({ damageRatio }, config) => damageRatio * config.lossDamageWeight,
};

export interface RatingChange {
  readonly k: number;
  readonly expectedScore: number;
  readonly actualScore: number;
  readonly damageRatio: number;
  readonly delta: number;
  readonly nextRating: number;
}

/** Pure calculation. The caller owns authoritative inputs and transactional storage. */
export function calculateRatingChange(
  input: RatingInput,
  config: RatingConfig = defaultRatingConfig,
  performance: PerformanceStrategy = damagePerformanceStrategy,
): RatingChange {
  validateInput(input);
  validateConfig(config);
  const k =
    input.completedGames <= config.provisionalGames
      ? config.kValues.provisional
      : input.completedGames <= config.regularGames
        ? config.kValues.regular
        : config.kValues.veteran;
  const expectedScore = 1 / (1 + 10 ** ((input.opponentRating - input.rating) / 400));
  const damageRatio = Math.min(1, Math.max(0, input.damageDealt / input.opponentInitialHp));
  const lossScore =
    input.outcome === 'LOSS'
      ? performance.lossScore(
          {
            damageRatio,
            damageDealt: input.damageDealt,
            opponentInitialHp: input.opponentInitialHp,
          },
          config,
        )
      : 0;
  if (!Number.isFinite(lossScore)) throw new RangeError('Loss performance score must be finite.');
  const actualScore =
    input.outcome === 'WIN'
      ? 1
      : input.outcome === 'DRAW'
        ? 0.5
        : Math.min(config.maxLossScore, Math.max(0, lossScore));
  const delta = k * (actualScore - expectedScore);
  return { k, expectedScore, actualScore, damageRatio, delta, nextRating: input.rating + delta };
}

export interface SoftResetConfig {
  readonly anchor: number;
  /** 0 resets to anchor; 1 retains the previous rating. */
  readonly retention: number;
}

export function softResetRating(rating: number, config: SoftResetConfig): number {
  if (
    !Number.isFinite(rating) ||
    !Number.isFinite(config.anchor) ||
    !Number.isFinite(config.retention) ||
    config.retention < 0 ||
    config.retention > 1
  )
    throw new RangeError('Invalid season soft reset settings.');
  return config.anchor + (rating - config.anchor) * config.retention;
}

function validateInput(input: RatingInput): void {
  if (
    !Number.isFinite(input.rating) ||
    !Number.isFinite(input.opponentRating) ||
    !Number.isSafeInteger(input.completedGames) ||
    input.completedGames < 0 ||
    !Number.isFinite(input.damageDealt) ||
    input.damageDealt < 0 ||
    !Number.isFinite(input.opponentInitialHp) ||
    input.opponentInitialHp <= 0
  )
    throw new RangeError('Invalid authoritative rating input.');
}

function validateConfig(config: RatingConfig): void {
  if (
    !Number.isSafeInteger(config.provisionalGames) ||
    config.provisionalGames < 0 ||
    !Number.isSafeInteger(config.regularGames) ||
    config.regularGames < config.provisionalGames ||
    !Object.values(config.kValues).every((k) => Number.isFinite(k) && k > 0) ||
    !Number.isFinite(config.maxLossScore) ||
    config.maxLossScore < 0 ||
    config.maxLossScore > 1 ||
    !Number.isFinite(config.lossDamageWeight) ||
    config.lossDamageWeight < 0
  )
    throw new RangeError('Invalid rating configuration.');
}
