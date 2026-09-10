# Local development environment (F02)

This document covers the local Docker runtime introduced by task F02
(`docs/PARALLEL_WORK_PLAN.md`, Phase 0). It does not cover application setup
for `apps/api`, `apps/web`, or `apps/admin`; those containers and their
startup steps are added by each app's owning implementation phase and
verified again at integration time (F03 and later).

## Prerequisites

- [mise](https://mise.jdx.dev/) with versions pinned in `mise.toml`
  (`mise install`).
- Docker Engine with the Compose v2 plugin (`docker compose version`).
  - Windows: Docker Desktop, or Docker Engine inside WSL2.
  - WSL2 / Linux: Docker Engine + `docker-compose-plugin`.
- Node.js 26.8.2 (via mise) to run `scripts/setup/setup.mjs`.

## What this task provides

```text
docker-compose.yml     postgres + mailpit services
infra/docker/           postgres init-script mount point, structure notes
.env.example            environment variable template
scripts/setup/setup.mjs generates .env, starts postgres/mailpit, waits for health
```

`api`, `web`, and `admin` services are intentionally not defined in
`docker-compose.yml` yet — those apps do not exist in the repository yet, so
there is nothing to containerize. Adding them is out of scope for F02.

## Usage

```sh
mise install
cp .env.example .env   # or let scripts/setup/setup.mjs generate it
node scripts/setup/setup.mjs
```

`scripts/setup/setup.mjs`:

1. Generates `.env` from `.env.example` if it does not already exist.
2. Runs `docker compose up -d postgres mailpit`.
3. Polls `pg_isready` inside the `postgres` container until ready.
4. Polls `http://localhost:${MAILPIT_UI_PORT}/livez` and `/readyz` until
   Mailpit responds `200 OK`.
5. Prints which later `pnpm setup` steps (DB migration, DB seed, dev user,
   card/mission/cosmetic data) are **not implemented yet** — those belong to
   D00, E02, M00, and related tasks (spec §5.2).

This script is not yet wired into a root `pnpm setup` command because the
root `package.json` `scripts` field belongs to the integration lead /
F01 (`docs/PARALLEL_WORK_PLAN.md`, "共有ファイルの所有権"); it will be wired
in once that contract exists.

Manual equivalent, without the setup script:

```sh
docker compose up -d postgres mailpit
docker compose ps
docker compose exec postgres pg_isready -U deckdrive -d deckdrive
curl http://localhost:8025/livez
curl http://localhost:8025/readyz
docker compose down
```

## Ports (defaults, overridable via `.env`)

| Service | Port | Purpose |
| --- | --- | --- |
| postgres | 5432 | PostgreSQL wire protocol |
| mailpit | 1025 | SMTP (dev outbound mail capture) |
| mailpit | 8025 | Web UI + REST API (`/livez`, `/readyz`) |

## Health checks

- `postgres`: Compose `healthcheck` using `pg_isready`, since the official
  `postgres` image ships `psql`/`pg_isready`.
- `mailpit`: the `axllent/mailpit` image is a minimal scratch-based build
  with no shell, `wget`, or `curl`, so it cannot run a container-exec
  `HEALTHCHECK`. Mailpit exposes `/livez` and `/readyz` HTTP endpoints
  instead; `scripts/setup/setup.mjs` polls them from the host. Do not add a
  `CMD-SHELL` healthcheck to the `mailpit` service — it will fail because
  no shell exists in the container.

## Data persistence

`postgres` data is stored in the named volume `postgres-data`. To reset:

```sh
docker compose down -v
```

## Verification performed for this task

- Compose file structure and syntax were reviewed manually and validated by
  parsing `docker-compose.yml` with a standard YAML parser (no syntax
  errors, expected service/volume keys present).
- **Not verified in this environment**: actually running
  `docker compose up -d postgres mailpit` and observing the containers reach
  a healthy state. The development machine used for this task did not have
  Docker (or a working WSL2 distribution) installed, so live container
  startup and health-endpoint responses could not be exercised here. Before
  merging or relying on this configuration, run the "Usage" steps above on a
  machine with Docker installed and confirm:
  - `docker compose config` reports no errors.
  - `docker compose ps` shows `postgres` as `healthy`.
  - `curl http://localhost:8025/livez` and `/readyz` return `200`.
- `api` / `web` / `admin` real startup is explicitly out of scope (see
  "What this task provides" above) and is verified by their owning phases
  and F03 integration.

## Known limitations

- Redis is intentionally not included (spec §5.3: not required for the
  initial version).
- No custom `Dockerfile`s are introduced by this task; only official
  upstream images (`postgres`, `axllent/mailpit`) are used.
