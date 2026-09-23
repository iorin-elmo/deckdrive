# Phase 5 web client

`apps/web` is the Vite single-page client for the Phase 5 flow. It uses React
Router for routes, TanStack Query for API data, Zustand for the development
session, Tailwind CSS for utilities, and `@deck-drive/ui` for shared accessible
primitives.

## Run locally

Create the required workspace-root development environment file before starting the API:

```powershell
Copy-Item .env.example .env
```

With local PostgreSQL running, migrate and seed the development database:

```powershell
corepack pnpm --filter @deck-drive/api prisma:generate
corepack pnpm --filter @deck-drive/api prisma:migrate:dev
corepack pnpm --filter @deck-drive/api prisma:seed
```

Start the API in one terminal:

```powershell
corepack pnpm --filter @deck-drive/api dev
```

The API `dev` command builds the game-engine workspace dependency and generates
the Prisma client before it starts the server; database migration and seed remain
explicit setup steps above.

Start the web client in a second terminal:

```powershell
corepack pnpm --filter @deck-drive/web dev
```

Vite serves the client at `http://localhost:5173` and proxies `/api` to
`http://127.0.0.1:3000`. Set `VITE_API_URL` to use an explicitly configured
API origin instead, or set `VITE_API_PROXY` to change the local proxy target.
For a cross-origin `VITE_API_URL`, configure the API's `CORS_ORIGINS` to
include the web application's origin (the default permits
`http://localhost:5173`). The API binds `127.0.0.1` by default. A non-loopback
`HOST` is not a development-login deployment mode: `POST /api/v1/auth/development`
accepts loopback clients only. Put a LAN or container API behind an authenticated
reverse proxy rather than exposing development authentication. Put the Vite
variables in the workspace-root `.env` file.

`CARD_DATA_VERSION` selects the card-data snapshot supplied to the deck builder
for newly created decks. It defaults to `1.0.0` and should match the current
card definitions seeded into the API database.

## Offline preview

When the API or local database is unavailable, the development login error
offers an explicit **Open offline preview** action. It uses fixture data solely
for navigating the client and is visibly labelled `Offline preview`; it never
contacts or writes to the API. Run the API and database above to test the real
development-login flow.

## Implemented routes

- `/` title experience
- `/login` development-only login placeholder
- `/home` player summary and next actions
- `/cards` and `/cards/:cardId` public card list and detail
- `/decks`, `/decks/new`, and `/decks/:deckId/edit` saved deck inspection and builder
- `/battle/cpu` CPU deck/difficulty setup
- `/battle/cpu/:matchId` returned CPU match state
- `/result/:matchId` persisted result state

All server reads include loading, error, and empty states. The deck builder uses
the authenticated collection and writes exact 30-card lists through the Phase 4
deck endpoints. The shell supports keyboard focus, labelled controls, compact
mobile navigation, and reduced motion preferences.

## API boundary

Phase 4 exposes CPU match creation and match state retrieval, but no
player-action endpoint. The battle screen therefore renders the server-returned
state without inventing client-authoritative actions. The CPU profile is sent
when a match is created, but it does not affect the returned initial state until
the later player-action and CPU-turn protocol is available.

## Verification

```powershell
corepack pnpm --filter @deck-drive/web test
corepack pnpm --filter @deck-drive/web build
```

The API client tests cover endpoint, header, payload, and error contracts.
