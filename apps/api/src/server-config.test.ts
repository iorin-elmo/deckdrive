import { describe, expect, it } from 'vitest';

import { apiCorsOrigins, apiHost, apiPort } from './server-config.js';

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

describe('apiCorsOrigins', () => {
  it('allows the local Vite origin by default', () => {
    expect(apiCorsOrigins(undefined)).toEqual(['http://localhost:5173']);
  });

  it('splits configured origins and ignores surrounding whitespace', () => {
    expect(apiCorsOrigins('https://deckdrive.example, http://localhost:4173 ')).toEqual([
      'https://deckdrive.example',
      'http://localhost:4173',
    ]);
  });

  it('rejects an explicit empty origin list', () => {
    expect(() => apiCorsOrigins(' , ')).toThrow('CORS_ORIGINS must include');
  });
});

describe('apiHost', () => {
  it('binds to all interfaces by default', () => {
    expect(apiHost(undefined)).toBe('0.0.0.0');
  });

  it('accepts a configured host value', () => {
    expect(apiHost(' 127.0.0.1 ')).toBe('127.0.0.1');
  });

  it('rejects an explicit empty host', () => {
    expect(() => apiHost('  ')).toThrow('HOST must include');
  });
});
