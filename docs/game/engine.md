# Game Engine invariants

`@deck-drive/game-engine` is a deterministic, side-effect-free domain package.
It owns battle-state transitions and emitted events; callers supply only a
serializable state, player action, and card-definition source.

## Phase 1 acceptance

`packages/game-engine/src/invariants.property.test.ts` uses `fast-check` with
the battle fixture at `tests/fixtures/battles/phase-1-invariants.json`.
Generated valid action sequences verify the following invariants after every
transition:

- HP and energy never fall below zero.
- Every card instance remains in exactly one of draw pile, hand, or discard.
- Draw-pile size does not exceed the fixture deck limit.
- A card definition never exceeds its fixture limit of three copies per player.
- Turn numbers never regress.

Generated invalid play actions return the original state reference, emit no
events, and leave the input state structurally unchanged. Replaying the same
fixture seed and generated action sequence produces the same final state.

## Dependency boundary

Engine implementation modules import only local engine modules. They do not
depend on UI, CPU policy, database, HTTP, filesystem, framework, or global
randomness. Filesystem access in the property test is test-only and loads the
shared battle fixture; production engine code performs no I/O.

## Definition of done

For this Engine change, these applicable §110 checks are complete:

- Implementation, typecheck, unit/property tests, and documentation are present.
- Determinism is tested.
- UI, loading, empty, responsive, accessibility, logging, security, migration,
  and E2E checks are not applicable because this change has no user interface,
  service, database, or external I/O.

Replay regression remains pending for R00/R02, when the replay format and
fixtures exist. It is a required Game Engine check and is not satisfied by this
Phase 1 change.

## Battle protocol 2

Issue #51 adds protocol 2 without changing the frozen protocol 1 contracts.
Callers create `BattleStateV2` with `createInitialBattleStateV2` and submit only
server-sequenced `BattleInput` values to `applyBattleInputV2`. Client actions and
trusted server commands share one contiguous `inputSequence`; clients cannot
choose that value or call the server-command transport.

Protocol 2 owns these additional deterministic state values:

- versioned card instances, an exhaust zone, and deterministic discard reshuffling;
- energy that card effects may raise above `maxEnergy`;
- a public ordered `chantQueue` whose entries are countdown state, not cards;
- per-player `synthesisCount` and `alchemyStage`;
- generated-card, chant-entry, choice-request, event, and input sequences;
- pending card-choice state without wall-clock timestamps;
- an explicit terminal reason and special-victory identifier.

HP termination is checked before special victory. `MAGE_GRAND_WISH` resolves
from the chant queue, while `ALCHEMY_SAGE_STONE` requires stage 3. A legal
synthesis with no recipe consumes its selected materials, increments
`synthesisCount`, and grants 2 block. Percentage helpers and odd divisions use
`Math.floor` semantics through `applyPercentageFloor`.

`recordReplayV2` and `verifyReplayV2` bind the complete input sequence to
`formatVersion: 2`, `battleProtocolVersion: 2`, an immutable SHA-256 card
definition revision, input-boundary snapshots, events, and final state. The API
repository dispatches by format version and persists server commands separately
from player actions. It stores the exact protocol-2 definition set as an immutable
revision-keyed snapshot, so later draft additions cannot invalidate old replays.
Format 1 continues to use `recordReplay` / `verifyReplay`,
action-index snapshots, and its existing schema.

Replay V2 command verification is fail-closed. API tooling obtains an HMAC
verifier from `BATTLE_COMMAND_SECRET`; V2 persistence cannot be loaded or saved
without one, while format 1 remains readable without this setting. Deadline and
timeout timestamps use non-negative UTC epoch milliseconds and are covered by
the signed payloads and the Replay V2 checksum.

The special-victory definitions remain outside the production seed and offline
preview catalog until the product match transport is upgraded from protocol 1.
This prevents protocol-2-only cards from entering decks that the current CPU
match flow cannot execute. The definitions, engine rules, persistence format,
and UI state rendering are available for that transport integration.
