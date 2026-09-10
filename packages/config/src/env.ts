export type NodeEnv = 'development' | 'test' | 'production';

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

/**
 * Parses a `NODE_ENV`-like value, defaulting to `development` when unset.
 * Throws for any explicit, unrecognized value instead of silently accepting it.
 */
export function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === undefined || value === '') {
    return 'development';
  }

  if ((NODE_ENVS as readonly string[]).includes(value)) {
    return value as NodeEnv;
  }

  throw new Error(`Invalid NODE_ENV: "${value}". Expected one of ${NODE_ENVS.join(', ')}.`);
}
