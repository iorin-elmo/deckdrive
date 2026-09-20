import { describe, expect, it } from 'vitest';

import { assertDevelopmentSeedEnvironment } from './seed-environment.js';

describe('development seed environment', () => {
  it('allows only an explicit development environment', () => {
    expect(() => assertDevelopmentSeedEnvironment({ NODE_ENV: 'development' })).not.toThrow();
  });

  it.each([undefined, 'test', 'production'])('rejects NODE_ENV=%s', (nodeEnvironment) => {
    expect(() => assertDevelopmentSeedEnvironment({ NODE_ENV: nodeEnvironment })).toThrow(
      'Development seed requires NODE_ENV=development',
    );
  });
});
