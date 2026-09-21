import { describe, expect, it } from 'vitest';

import {
  DevelopmentAuthenticationDisabledError,
  assertDevelopmentAuthentication,
} from './development-auth.js';

describe('development authentication', () => {
  it('is available only in development', () => {
    expect(() => assertDevelopmentAuthentication({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertDevelopmentAuthentication({ NODE_ENV: 'production' })).toThrow(
      DevelopmentAuthenticationDisabledError,
    );
  });
});
