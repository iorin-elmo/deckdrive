# ADR 0001: Engine and card contracts

- Status: Accepted
- Date: 2026-09-11

## Context

DeckDrive needs replayable and server-authoritative battles. The engine therefore
needs stable public contracts before card content, random-number implementation,
or rule effects are added.

## Decision

`@deck-drive/game-engine` owns immutable battle state, player decisions,
engine-generated events, results, and the `RandomSource` boundary. Its public
entry point exports `validateAction`, `applyAction`, and `calculateResult`.

The state records `rulesVersion`, `cardDataVersion`, and `seed`. A match records
the rules and card-data versions selected when it starts; callers must not infer
them from current deployment state. The engine is responsible for interpreting
those versions, while `@deck-drive/card-definitions` supplies versioned,
serializable definitions.

Card definitions use a definition ID and version. Battle state instead stores
card instances with a separate instance ID plus the definition ID. This permits
multiple copies of one definition and makes replay/event references unambiguous.

Only player decisions may enter as `GameAction`. Damage, healing, drawing, state
changes, events, and random values are engine-owned outputs. Invalid actions
return a structured failure containing the original state and no events. Public
state and collections are readonly; future state transitions must return new
state rather than mutate input.

This ADR does not set initial-hand size, draw cadence, hand limit, deck
exhaustion behavior, block lifetime, first-player advantage, or card values.
Those rule choices remain for their dedicated milestones and ADRs.

`@deck-drive/game-engine` must not depend on a database, HTTP, React, NestJS,
the filesystem, or card-definition runtime code. `@deck-drive/card-definitions`
is likewise data-contract-only and does not import the engine. Integration code
may depend on both packages.

## Consequences

The E00 implementation validates the boundary but deliberately returns
`ACTION_NOT_IMPLEMENTED` for valid actions. Seeded RNG is introduced in E01,
card content in E02, and rule-effect state transitions in E03. This prevents a
successful no-op from being mistaken for completed battle rules.
