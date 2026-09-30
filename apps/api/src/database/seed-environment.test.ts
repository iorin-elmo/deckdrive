import { describe, expect, it } from 'vitest';

import { assertDevelopmentSeedEnvironment } from './seed-environment.js';

const localDatabaseUrl = 'postgresql://deckdrive:deckdrive@127.0.0.1:5432/deckdrive';

describe('development seed environment', () => {
  it('allows only an explicit development environment', () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: localDatabaseUrl,
      }),
    ).not.toThrow();
  });

  it.each([undefined, 'test', 'production'])('rejects NODE_ENV=%s', (nodeEnvironment) => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: nodeEnvironment,
        DATABASE_URL: localDatabaseUrl,
      }),
    ).toThrow('Development database commands require NODE_ENV=development');
  });

  it('rejects an unset DATABASE_URL', () => {
    expect(() => assertDevelopmentSeedEnvironment({ NODE_ENV: 'development' })).toThrow(
      'Development database commands require DATABASE_URL',
    );
  });

  it('rejects a non-loopback DATABASE_URL', () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://deckdrive:deckdrive@db.example.com:5432/deckdrive',
      }),
    ).toThrow('Development database commands require a loopback DATABASE_URL host');
  });

  it('rejects DATABASE_URL host query overrides', () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: `${localDatabaseUrl}?host=db.example.com`,
      }),
    ).toThrow('Development database commands do not allow DATABASE_URL host overrides');
  });

  it('allows an IPv6 loopback DATABASE_URL', () => {
    expect(() =>
      assertDevelopmentSeedEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://deckdrive:deckdrive@[::1]:5432/deckdrive',
      }),
    ).not.toThrow();
  });
});
