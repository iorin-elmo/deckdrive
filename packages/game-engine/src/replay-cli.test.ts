import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const script = path.join(root, 'scripts/replay/replay.mjs');
const fixtures = path.join(root, 'tests/fixtures/replays');
const temporaryDirectories: string[] = [];

beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      'packages/game-engine/tsconfig.json',
    ],
    { cwd: root },
  );
});

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function run(matchId: string, fixturesDirectory = fixtures) {
  return spawnSync(process.execPath, [script, '--match', matchId], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, REPLAY_FIXTURES_DIR: fixturesDirectory },
  });
}

function copiedFixtures(mutator: (fixture: Record<string, unknown>) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'deckdrive-replay-'));
  temporaryDirectories.push(directory);
  cpSync(fixtures, directory, { recursive: true });
  const file = path.join(directory, 'phase-2-recording.json');
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  mutator(fixture);
  writeFileSync(file, `${JSON.stringify(fixture)}\n`);
  return directory;
}

describe('replay CLI', () => {
  it('verifies a known fixture by match ID', () => {
    const result = run('phase-2-recording');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Replay phase-2-recording verified.\n');
  });

  it('reports a missing fixture', () => {
    const result = run('missing-match');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REPLAY_NOT_FOUND');
  });

  it('rejects an unsupported fixture format version', () => {
    const result = run(
      'phase-2-recording',
      copiedFixtures((fixture) => {
        fixture.formatVersion = 2;
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('UNSUPPORTED_REPLAY_FORMAT');
  });

  it('rejects a fixture whose expected replay output does not match', () => {
    const result = run(
      'phase-2-recording',
      copiedFixtures((fixture) => {
        (fixture.expectedReplay as Record<string, unknown>).checksum = 'fnv1a-32:00000000';
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REPLAY_MISMATCH');
  });
});
