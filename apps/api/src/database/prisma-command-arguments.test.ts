import { describe, expect, it } from 'vitest';

import { assertNoPrismaDatasourceOverrides } from './prisma-command-arguments.js';

describe('Prisma command arguments', () => {
  it.each([
    ['--config path/to/prisma.config.ts', ['--config', 'path/to/prisma.config.ts']],
    ['--config=path/to/prisma.config.ts', ['--config=path/to/prisma.config.ts']],
    [
      '--url postgresql://db.example.com/deckdrive',
      ['--url', 'postgresql://db.example.com/deckdrive'],
    ],
    [
      '--url=postgresql://db.example.com/deckdrive',
      ['--url=postgresql://db.example.com/deckdrive'],
    ],
  ])('rejects %s', (_, arguments_) => {
    expect(() => assertNoPrismaDatasourceOverrides(arguments_)).toThrow(
      'Development database commands do not allow Prisma datasource overrides',
    );
  });

  it('allows migration-specific arguments', () => {
    expect(() =>
      assertNoPrismaDatasourceOverrides(['--name', 'add-match-index', '--create-only']),
    ).not.toThrow();
  });
});
