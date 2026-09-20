# Database operations

## Phase 3 persistence baseline

The Prisma schema and its initial migration own only the Phase 3 persistence
baseline: users and players, versioned cards and decks, and the match/action/
event/snapshot records needed by D01. Card definitions and every recorded
match retain their card-data, rules, and engine versions. The migration uses
foreign keys, composite uniqueness, ordered replay indexes, and database check
constraints to reject duplicate or invalid persisted positions, quantities,
seats, and sequences.

Future-phase tables for OAuth, rankings, packs, missions, cosmetics, rewards,
and administration are deliberately not created here. D01 is responsible for
the repository and transaction boundary that writes real engine replays.

## Commands

After `pnpm setup` has created `.env` and PostgreSQL is healthy, run:

```sh
pnpm db:validate
pnpm db:migrate
pnpm db:seed
```

`db:migrate` is a development command. Production deployments must use the
immutable, committed migration history through `pnpm db:migrate:deploy`; they
must never use `migrate dev`, `db push`, or a direct schema edit.

`db:seed` is deliberately restricted to `NODE_ENV=development`. It installs
the fixture-backed debug user, sample cards, a deck, and a sample match, and
refuses `production`, test, or an unset environment. Seed data is idempotent
but is never part of a production deployment.

## Recovery policy

Migrations are reviewed, committed SQL and are additive at this baseline; do
not edit an applied migration. Before a production migration, take a backup and
verify it can be restored into a separate database. If a deployment fails,
stop the application, preserve the failed migration state and logs, restore or
roll forward using a reviewed migration, and only then mark migration state as
resolved. Do not erase migration history or roll back production by running a
development reset. Automated backup, retention, and restore rehearsal remain
the Phase 12 infrastructure deliverable.

## Validation status

The schema is validated and the migration is generated from an empty schema.
The development seed guard is unit-tested. Applying the migration and seed to
an empty PostgreSQL instance requires a running Docker daemon and is recorded
as an environment-dependent check until that daemon is available.
