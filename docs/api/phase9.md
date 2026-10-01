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

Committed queue/invite metadata is stored with the match and restored after an
API restart. Uncommitted queue entries and invites expire with the in-memory
lobby.

Clients send `ACTION`, `PING`, and `RESYNC`. The server sends `STATE`,
`EVENT`, `ERROR`, and `PONG`. An action contains a request id and the accepted
action sequence known by the client. A request id is idempotent per player and
match. Actions are processed by one queue, so concurrent requests cannot apply
against the same state.
Retries compare the parsed action fields, not JSON property order. A WebSocket
handshake alone does not reset the browser's reconnect budget; a valid `STATE`
must arrive before the attempt counter is reset.
An accepted request is acknowledged separately from replacing the UI state, so
a cached response for an older action can unlock controls without rolling back
a newer reconnect snapshot.

`apps/api/src/pvp/protocol.ts` is deliberately independent of the WebSocket
framing layer. It validates untrusted JSON at runtime and creates the player
projection. The projection never includes the seed, draw-pile contents, or the
opponent's hand. Draw and discard event card ids are also redacted for the
opponent.

## Reconnect and timeout

`MatchSession` keeps action/event sequence boundaries and snapshots. A reconnect
receives the latest snapshot followed by events after that snapshot. The browser
client tracks the event cursor, sends `RESYNC`, and reconnects with exponential
backoff after a socket failure. The initial turn timeout is 60 seconds. A
disconnected participant has a 60-second grace period, including matches that
have not received their first socket yet; after it expires the session is
abandoned. Three consecutive timeouts by one participant are recorded as a
timeout penalty and abandon the match. Time is injected into the session and is
advanced by the HTTP server's scheduler, which keeps this logic deterministically
testable.

`PrismaPvpMatchPersistence` writes the accepted action, engine events, and
snapshot in one transaction. The match row is locked before the action is
inserted. The in-memory state is committed only after that persistence callback
succeeds. Accepted actions persist their authenticated player, request ID,
source, timeout streak, and response, so a retry after restart returns the same
response. A stale worker is rejected by the database sequence check and the
service reloads the match from durable state.

## Casual and private matches

`PvpLobby` owns the casual queue and private invite lifecycle. Deck values are
opaque server-loaded values; callers must load and validate decks before
entering the lobby. It creates a `MatchSession` only after both players are
known.

The browser consumes the saved private invite when it enters the matched battle,
allowing the host to return to matchmaking. Current casual queue reservations take
precedence over retained status records from previous matches.

Run a single API process (`PVP_WORKER_COUNT=1`). The startup guard rejects larger
configured worker counts; it does not detect independently launched replicas.
Shared matchmaking is required before deploying multiple API processes.

The WebSocket adapter accepts an injected `PvpWebSocketRegistry`. The production
server resolves the HttpOnly session cookie through O00's `OAuthService`; the
development-only player header is accepted only in development and test
environments. WebSocket origins include `CORS_ORIGINS` and the configured
application origin. PvP transport code does not depend on the OAuth
implementation.

The existing match endpoint keeps its `initialState`/`finalState` response for
CPU matches. PvP matches use the player-specific `state` projection so hidden
hands and piles are never exposed over HTTP.

## Validation boundary

The unit suite covers action serialization, idempotency, protocol projection,
real-socket reconnect, and routed UI recovery (including delayed action
acknowledgements and returning to the private lobby).
The database-backed reconnect integration test exercises cookie-authenticated
private match creation, real Prisma persistence, disconnect, a fresh API server
and `PvpMatchService.restore`, then snapshot and missing-event recovery through
the real browser `PvpSocketClient` and a cookie-bearing WebSocket transport.
An API restart resets every active player's disconnect
grace period because no old socket survives the restart; presence writes retry
until the database recovers rather than silently stopping after three failures.
