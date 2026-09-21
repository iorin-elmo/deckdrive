import { describe, expect, it } from 'vitest';

import { apiPort } from './server-config.js';

describe('apiPort', () => {
  it('uses 3000 by default', () => {
    expect(apiPort(undefined)).toBe(3000);
  });

  it('accepts valid TCP ports', () => {
    expect(apiPort('4173')).toBe(4173);
  });

  it('rejects malformed and out-of-range ports', () => {
    expect(() => apiPort('not-a-port')).toThrow('PORT must be an integer');
    expect(() => apiPort('0')).toThrow('PORT must be an integer');
    expect(() => apiPort('65536')).toThrow('PORT must be an integer');
  });
});
