import { describe, expect, it } from 'vitest';

import { parseNodeEnv } from './env.js';

describe('parseNodeEnv', () => {
  it('defaults to development when unset or empty', () => {
    expect(parseNodeEnv(undefined)).toBe('development');
    expect(parseNodeEnv('')).toBe('development');
  });

  it('accepts known environments', () => {
    expect(parseNodeEnv('test')).toBe('test');
    expect(parseNodeEnv('production')).toBe('production');
  });

  it('rejects unknown environments', () => {
    expect(() => parseNodeEnv('staging')).toThrowError(/Invalid NODE_ENV/);
  });
});
