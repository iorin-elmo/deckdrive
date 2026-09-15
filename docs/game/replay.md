# Replay format and recording

R00 introduces a dependency-free, JSON-compatible replay format in
`@deck-drive/game-engine`. The engine neither reads nor writes files; R01 will
own CLI and fixture loading, while Phase 3 will provide database adapters.

## Record format

`recordReplay(initialState, actions, definitions, options)` records these
values after applying each legal action deterministically:

- `matchId`, `seed`, and the engine, rules, and card-data versions;
- `initialState`, player `actions`, the complete ordered `events` stream, and
  `finalState`;
- snapshots at action zero, each configured interval, and the final action;
- a format version and deterministic FNV-1a checksum.

Snapshots carry both `actionIndex` and the last included `eventSequence`, so a
consumer can resume from a known action/event boundary. The initial state and
all snapshots remain ordinary engine state: no filesystem paths, timestamps,
network data, or runtime-global state are recorded.

## Verification and version policy

`verifyReplay(replay, definitions)` first verifies the checksum, then reruns
every action from `initialState` and compares the resulting metadata, events,
snapshots, and final state. It therefore detects changed actions, events,
snapshots, states, and version or seed metadata. The checksum detects storage
corruption or uncoordinated edits; it is not an authenticity signature, which
must be supplied by the persistence boundary if needed.

R00 supports replay format version `1` and records the exact engine, rules,
and card-data versions used. It never silently substitutes a version. R01's
loader must reject an unavailable version explicitly; future version adapters
may be added as explicit migrations without rewriting old fixtures.

## Validation evidence

`packages/game-engine/src/replay.test.ts` loads
`tests/fixtures/replays/phase-2-recording.json` and verifies successful replay
equality against golden event types, snapshot boundaries, final state, and a
full-record checksum. It also verifies invalid-action rejection, checksum
mismatch detection, recalculated-checksum consistency detection, and UTF-8
handling for non-ASCII metadata.

Applicable Definition of Done: implementation, typecheck, unit test,
determinism/replay regression, error state, security consideration, and
documentation. Integration, E2E, loading/empty/a11y/responsive checks are not
applicable because this task exposes no UI, CLI, database, or filesystem I/O.
