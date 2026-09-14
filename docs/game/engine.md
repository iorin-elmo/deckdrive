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

For this Engine change, the applicable §110 checks are complete:

- Implementation, typecheck, unit/property tests, and documentation are present.
- Determinism is tested. Replay regression is intentionally deferred to R00/R02,
  when the replay format and fixtures exist.
- UI, loading, empty, responsive, accessibility, logging, security, migration,
  and E2E checks are not applicable because this change has no user interface,
  service, database, or external I/O.
