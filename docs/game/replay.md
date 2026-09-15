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
consumer can resume from a known action/event boundary. Snapshot state omits
the event history to avoid storing every growing event prefix repeatedly;
`restoreReplaySnapshot(snapshot, replay.events)` reconstructs an ordinary
`BattleState` at that boundary. The initial state and snapshot state contain no
filesystem paths, timestamps, network data, or runtime-global state.

## Verification and version policy

`verifyReplay(replay, definitions)` first validates the persisted shape and
verifies the checksum, then reruns
every action from `initialState` and compares the resulting metadata, events,
snapshots, and final state. It therefore detects changed actions, events,
snapshots, states, and version or seed metadata. The checksum detects storage
corruption or uncoordinated edits; it is not an authenticity signature, which
must be supplied by the persistence boundary if needed.

Persisted data validation covers replay metadata plus nested battle states,
actions, events, and snapshots before replay execution, including the engine's
exact two-player battle invariant, unique player/card-instance IDs, and
active-player membership, HP/energy bounds, and strictly ordered event
sequences. Malformed JSON data is reported as `REPLAY_MISMATCH`, including
when its checksum was recomputed. Canonical checksums use JSON-compatible
handling for omitted object properties and sparse array slots; persisted
collections reject sparse slots as malformed data.

R00 supports replay format version `1` and records the exact engine, rules,
and card-data versions used. It never silently substitutes a version. R01's
loader must reject an unavailable version explicitly; future version adapters
may be added as explicit migrations without rewriting old fixtures.

## Validation evidence

`packages/game-engine/src/replay.test.ts` loads
`tests/fixtures/replays/phase-2-recording.json` and compares a successful
recording with golden full events, event-free snapshot states, final state, and
checksum. It also verifies invalid-action rejection, checksum mismatch
detection, recalculated-checksum consistency detection, malformed persisted
content, optional properties set to `undefined`, and UTF-8 handling for
non-ASCII metadata.

Applicable Definition of Done: implementation, typecheck, unit test,
determinism/replay regression, error state, security consideration, and
documentation. Integration, E2E, loading/empty/a11y/responsive checks are not
applicable because this task exposes no UI, CLI, database, or filesystem I/O.
