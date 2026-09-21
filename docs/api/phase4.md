# Phase 4 API contract

The native HTTP adapter serves the versioned `/api/v1` controller. The adapter
is deliberately separate from domain services and the game engine.

## Authentication boundary

`POST /api/v1/auth/development` creates or selects a local player only when
`NODE_ENV=development`. It is rejected in every other environment. Authenticated
endpoints require `X-Deckdrive-Player-Id`; the server resolves that ID to a
player before reading or changing data.

JSON request bodies are limited to 1 MiB. Malformed JSON receives `400`, and a
body exceeding the limit receives `413` before the controller is invoked.

## Implemented endpoints

- `GET /api/v1/cards` and `GET /api/v1/cards/:id` expose versioned card data.
- `GET /api/v1/me` returns the authenticated player and derived ledger balances.
- `GET /api/v1/decks`, `POST /api/v1/decks`, `PUT /api/v1/decks/:id`, and
  `DELETE /api/v1/decks/:id` manage only the caller's decks.
- `POST /api/v1/matches` creates a CPU match from an owned deck and accepts
  `EASY`, `NORMAL`, `HARD`, or `EXPERT`; `GET /api/v1/matches/:id` is owner-only.

Deck writes require exactly 30 owned cards and enforce both the global and
per-card copy limits. CPU decisions use only actions accepted by the game
engine. `CurrencyTransaction` is append-only, has a positive reward amount,
and is unique on player plus idempotency key; the reward service performs its
lookup and insert inside the same Prisma transaction for reuse by Pack and
Mission phases.

## Phase boundary

OAuth sessions, player-selected battle actions, missions, packs, and the UI
belong to their later phases. This API provides their ownership, persistence,
and reward contracts without putting HTTP or database dependencies in the game
engine.
