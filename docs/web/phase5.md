# Phase 5 web client

`apps/web` is the Vite single-page client for the Phase 5 flow. It uses React
Router for routes, TanStack Query for API data, Zustand for the development
session, Tailwind CSS for utilities, and `@deck-drive/ui` for shared accessible
primitives.

## Run locally

With local PostgreSQL running, migrate and seed the development database, then
start the API before the web client:

```powershell
corepack pnpm --filter @deck-drive/api prisma:migrate:dev
corepack pnpm --filter @deck-drive/api prisma:seed
corepack pnpm --filter @deck-drive/api dev
corepack pnpm --filter @deck-drive/web dev
```

Vite serves the client at `http://localhost:5173` and proxies `/api` to
`http://localhost:3000`. Set `VITE_API_URL` to use an explicitly configured
API origin instead, or set `VITE_API_PROXY` to change the local proxy target.
For a cross-origin `VITE_API_URL`, configure the API's `CORS_ORIGINS` to
include the web application's origin (the default permits `http://localhost:5173`).

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
- `/cards` and `/cards/:cardId` card list and detail
- `/decks` and `/decks/:deckId` saved deck list and inspection
- `/battle/cpu` CPU deck/difficulty setup
- `/battle/cpu/:matchId` returned CPU match state
- `/result/:matchId` persisted result state

All server reads include loading, error, and empty states. The shell supports
keyboard focus, labelled controls, compact mobile navigation, and reduced
motion preferences.

## API boundary

Phase 4 exposes CPU match creation and match state retrieval, but no
player-action endpoint. The battle screen therefore renders the server-returned
state without inventing client-authoritative actions. Interactive turn controls
belong with the later real-time battle protocol.

## Verification

```powershell
corepack pnpm --filter @deck-drive/web test
corepack pnpm --filter @deck-drive/web build
```

The API client tests cover endpoint, header, payload, and error contracts.
