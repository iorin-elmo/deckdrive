import type { PrismaClient } from '../generated/prisma/client.js';

export const featureFlagDefaults = {
  ENABLE_RANKED: true,
  ENABLE_RARE_PACK: true,
  ENABLE_COSMETICS: true,
  ENABLE_PRIVATE_MATCH: true,
  ENABLE_DEBUG: false,
  MAINTENANCE_MODE: false,
} as const;

export type FeatureFlagName = keyof typeof featureFlagDefaults;

export function debugEnvironmentAllowed(environment: string | undefined): boolean {
  return environment === 'development' || environment === 'staging';
}

export function isFeatureFlagName(value: string): value is FeatureFlagName {
  return Object.hasOwn(featureFlagDefaults, value);
}

export class PrismaFeatureFlags {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'featureFlag'>,
    private readonly environment: string | undefined,
  ) {}

  async enabled(name: FeatureFlagName): Promise<boolean> {
    if (name === 'ENABLE_DEBUG' && !debugEnvironmentAllowed(this.environment)) return false;
    const row = await this.prisma.featureFlag.findUnique({ where: { name } });
    return row?.enabled ?? featureFlagDefaults[name];
  }

  async list() {
    const overrides = await this.prisma.featureFlag.findMany();
    const byName = new Map(overrides.map((flag) => [flag.name, flag]));
    return Object.entries(featureFlagDefaults).map(([name, defaultEnabled]) => ({
      name,
      enabled:
        name === 'ENABLE_DEBUG' && !debugEnvironmentAllowed(this.environment)
          ? false
          : (byName.get(name)?.enabled ?? defaultEnabled),
      configurable: !(name === 'ENABLE_DEBUG' && !debugEnvironmentAllowed(this.environment)),
    }));
  }
}
