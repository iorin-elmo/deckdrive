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

## Versioned input sequence extension

Replay format version `1` has no server commands, so its player `actions` are
the complete deterministic input sequence and the existing
`recordReplay(initialState, actions, definitions, options)` API remains fixed
to that format.

A protocol that introduces result-affecting `ServerCommand` values must use a
new replay format. Its recording API is
`recordReplayV2(initialState, inputs, definitionSnapshot, { draftDefinitionRevision, battleProtocolVersion, ...options })`,
where `inputs` is the complete ordered `BattleInput` sequence and the revision
identifies that immutable definition snapshot. Its verification API is
`verifyReplayV2(replay, definitionSnapshots, serverCommandVerifier)`;
`definitionSnapshots` resolves an exact snapshot by the replay's
`draftDefinitionRevision`, and the final argument verifies deadline
authorization and timeout attestations. Each input
has a shared `inputSequence` and a kind of `CLIENT_ACTION` or
`SERVER_COMMAND`. Persisted `actions` and
`serverCommands` may remain separate arrays, but recording and verification
must merge them by `inputSequence`; duplicate or missing sequence values are
invalid. Snapshots for this format use the last resolved `inputSequence`
instead of `actionIndex`.

The deterministic contract for this format is `seed + initialState + complete
BattleInput sequence = finalState and events`. The versioned verifier must
replay both client actions and server commands and compare every input,
snapshot, event, and final state. Passing only player actions to the old format
`1` verifier cannot verify a replay that declares the new format.
The new replay stores `draftDefinitionRevision` and `battleProtocolVersion` as
required top-level fields. Recording verifies that the revision equals the
canonical digest of `definitionSnapshot`;
verification resolves the immutable snapshot by that revision, verifies its
digest, and rejects a missing or mismatched snapshot without falling back to
current definitions. The revision field is covered by the replay's canonical
checksum, and its canonical digest binds the full external definition snapshot.
The protocol version is also covered by the canonical checksum. Shape
validation requires it to match `initialState`, every snapshot, and the
allowed `GameAction` and `ServerCommand` variants. A new-format replay without
this field, or one that declares an old protocol while containing pending
choice inputs or state, is invalid. Format version `1` has no
`battleProtocolVersion` field and remains on its fixed legacy action contract.
The replay loader dispatches to `verifyReplay` or `verifyReplayV2` strictly by
the persisted `formatVersion` field and rejects unknown versions without fallback.

## Verification and version policy

For format version `1`, `verifyReplay(replay, definitions)` first validates the persisted shape and
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
sequences without gaps (including restored non-zero offsets), and phase/result consistency. Malformed JSON data is reported as
`REPLAY_MISMATCH`, including when its checksum was recomputed. Sequence and
snapshot indexes are safe integers. A terminal
event must be final and agree with the containing battle result. Canonical
checksums use JSON-compatible handling for omitted object properties and sparse
array slots; persisted collections reject sparse slots as malformed data.

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

R02 adds `pnpm test:replay` as the fixture regression gate. It compares the
complete persisted `Replay` (including format and snapshot metadata) assembled
from the known Phase 2 golden fixture, and proves that the gate matcher rejects
a deliberately changed expected result. The `quality` workflow runs this gate
separately from the general unit-test suite, which excludes it to avoid running
the same checks twice.

Applicable Definition of Done: implementation, typecheck, unit test,
determinism/replay regression, error state, security consideration, and
documentation. Integration, E2E, loading/empty/a11y/responsive checks are not
applicable because this task exposes no UI, CLI, database, or filesystem I/O.
