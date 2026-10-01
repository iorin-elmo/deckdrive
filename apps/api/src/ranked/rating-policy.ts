import { defaultRatingConfig, type RatingConfig } from './rating.js';

export interface RatingPolicy {
  readonly version: string;
  readonly config: RatingConfig;
}

// Append new versions here. Existing entries must retain their original values so
// matches started by an older deployment can be settled from their saved version.
const policies = Object.freeze({
  'elo-damage-v1': defaultRatingConfig,
});

export const currentRatingPolicyVersion: keyof typeof policies = 'elo-damage-v1';

export function ratingPolicyForVersion(version: string): RatingPolicy | undefined {
  return Object.hasOwn(policies, version)
    ? { version, config: policies[version as keyof typeof policies] }
    : undefined;
}
