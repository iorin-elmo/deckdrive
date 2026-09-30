# Phase 9: PvP transport

V00 adds the server-authoritative PvP transport boundary. The deterministic
engine remains the only place that validates and applies a game action.

## Protocol

The endpoint is:

```text
GET /ws/matches/:matchId
```

Match creation is authenticated and deck-owned:

```text
POST /api/v1/matches/casual
POST /api/v1/matches/private
POST /api/v1/matches/private/:inviteCode/join
GET /api/v1/matches/queue/:queueId
GET /api/v1/matches/private/:inviteCode/status
```

Casual returns `202 QUEUED` until another player is paired. Private returns an
invite code; joining the code creates and persists the match. The returned
match id is then used for the WebSocket connection.

The queue owner polls the queue endpoint with the returned `queueId`. A private
match host polls the status endpoint with the invite code. Both endpoints are
authenticated and return only the owner's status; once paired, the response
contains the `matchId`.

Clients send `ACTION`, `PING`, and `RESYNC`. The server sends `STATE`,
`EVENT`, `ERROR`, and `PONG`. An action contains a request id and the accepted
action sequence known by the client. A request id is idempotent per player and
match. Actions are processed by one queue, so concurrent requests cannot apply
against the same state.

`apps/api/src/pvp/protocol.ts` is deliberately independent of the WebSocket
framing layer. It validates untrusted JSON at runtime and creates the player
projection. The projection never includes the seed, draw-pile contents, or the
opponent's hand. Draw and discard event card ids are also redacted for the
opponent.

## Reconnect and timeout

`MatchSession` keeps action/event sequence boundaries and snapshots. A reconnect
receives the latest snapshot followed by events after that snapshot. The
initial turn timeout is 60 seconds. A disconnected match has a 60-second grace
period; after it expires the session is abandoned. Time is injected into the
session and is advanced by the HTTP server's scheduler, which keeps this logic
deterministically testable.

`PrismaPvpMatchPersistence` writes the accepted action, engine events, and
snapshot in one transaction. The match row is locked before the action is
inserted. The in-memory state is committed only after that persistence callback
succeeds.

## Casual and private matches

`PvpLobby` owns the casual queue and private invite lifecycle. Deck values are
opaque server-loaded values; callers must load and validate decks before
entering the lobby. It creates a `MatchSession` only after both players are
known.

The WebSocket adapter accepts an injected `PvpWebSocketRegistry`. The production
server resolves the HttpOnly session cookie through O00's `OAuthService`; the
development-only player header is accepted only in development and test
environments. PvP transport code does not depend on the OAuth implementation.
