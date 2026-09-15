#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  createInitialBattleState,
  recordReplay,
  replayFormatVersion,
  verifyReplay,
} from '../../packages/game-engine/dist/index.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFixturesDirectory = path.resolve(scriptDirectory, '../../tests/fixtures/replays');

export async function runReplayCli(argv, environment = process.env, io = console) {
  const matchId = parseMatchId(argv);
  const fixturesDirectory = environment.REPLAY_FIXTURES_DIR ?? defaultFixturesDirectory;
  const fixture = await loadFixture(fixturesDirectory, matchId);

  if (fixture.formatVersion !== replayFormatVersion) {
    fail(
      'UNSUPPORTED_REPLAY_FORMAT',
      `Fixture format ${String(fixture.formatVersion)} is not supported.`,
    );
  }

  const initialState = createInitialBattleState({
    matchId: fixture.matchId,
    seed: fixture.seed,
    engineVersion: fixture.engineVersion,
    rulesVersion: fixture.rulesVersion,
    cardDataVersion: fixture.cardDataVersion,
    initialDrawCount: fixture.initialDrawCount,
    turnDrawCount: fixture.turnDrawCount,
    players: fixture.players.map((player) => ({ id: player.id, drawPile: player.cards })),
  });
  const recorded = recordReplay(initialState, fixture.actions, fixture.definitions, {
    snapshotInterval: fixture.snapshotInterval,
  });
  if (!recorded.ok) fail('REPLAY_MISMATCH', recorded.error.message);

  try {
    assert.deepStrictEqual(
      {
        checksum: recorded.replay.checksum,
        events: recorded.replay.events,
        snapshots: recorded.replay.snapshots,
        finalState: recorded.replay.finalState,
      },
      fixture.expectedReplay,
    );
  } catch {
    fail('REPLAY_MISMATCH', `Fixture ${matchId} does not match its recorded replay output.`);
  }

  const verification = verifyReplay(recorded.replay, fixture.definitions);
  if (!verification.ok) fail(verification.error.code, verification.error.message);
  io.log(`Replay ${matchId} verified.`);
}

function parseMatchId(argv) {
  if (argv.length !== 2 || argv[0] !== '--match' || argv[1] === undefined || argv[1] === '') {
    fail('USAGE', 'Usage: pnpm replay --match <matchId>');
  }
  return argv[1];
}

async function loadFixture(fixturesDirectory, matchId) {
  let names;
  try {
    names = await readdir(fixturesDirectory);
  } catch {
    fail('REPLAY_NOT_FOUND', `No replay fixture exists for match ${matchId}.`);
  }
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    const file = path.join(fixturesDirectory, name);
    try {
      const fixture = JSON.parse(await readFile(file, 'utf8'));
      if (fixture.matchId === matchId) return fixture;
    } catch {
      // A malformed unrelated fixture must not prevent a match lookup.
    }
  }
  fail('REPLAY_NOT_FOUND', `No replay fixture exists for match ${matchId}.`);
}

function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runReplayCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
