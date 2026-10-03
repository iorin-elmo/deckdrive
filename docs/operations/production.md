# I00: Raspberry Pi deployment and recovery

This deployment keeps one API process, one PostgreSQL container, static web and
admin pages, and a Caddy HTTPS entry point on a 64-bit Raspberry Pi. The
`Deploy production` GitHub Actions workflow builds ARM64 images for the exact
develop/main commit, pushes immutable SHA tags to GHCR, and uses SSH to deploy.
The Pi keeps the runtime secrets; the workflow never uploads them.

## One-time preparation

1. Install 64-bit Raspberry Pi OS, Docker Engine with Compose v2, `curl`,
   `restic`, `flock`, `cron`, and Python 3. Give the deployment user Docker
   access and an SSH key. Arrange a reachable SSH endpoint (public SSH or a
   private network runner), DNS for `PUBLIC_HOST`, and inbound ports 80/443.
2. Create `~/deckdrive-prod`. Copy
   `infra/docker/runtime.env.example` to `~/deckdrive-prod/runtime.env` and
   `infra/docker/backup.env.example` to `~/deckdrive-prod/backup.env`; replace
   all placeholders. Set both files to mode `0600`. `DATABASE_URL` must point
   to `postgres:5432` and use the same credentials as `POSTGRES_*`. Register
   the exact HTTPS Discord callback URL. Keep the restic password and Pi SSH
   recovery credentials in a second secure location.
3. Configure the GitHub `production` environment with `DEPLOY_HOST`,
   `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. The last secret is
   the verified SSH public host-key line, obtained through an independent
   channel; do not use an unchecked `ssh-keyscan` result. The workflow uses
   the short-lived `GITHUB_TOKEN` for GHCR and requires `packages: write`.
4. Initialize a dedicated off-device encrypted repository once with the values from
   `backup.env`: `set -a; source ~/deckdrive-prod/backup.env; set +a; restic
   init`. For SFTP, provision a dedicated remote account/key and verify that
   the deployment user can reach it. Never put the repository on the Pi's
   local disk. Retention groups all `deckdrive` snapshots together, including
   snapshots made after replacing the Pi.
5. From GitHub Actions, run **Deploy production** on `develop` (or `main`).
   The workflow uploads Compose and operation scripts to `~/deckdrive-prod`.
   It pulls the new images, takes and verifies an encrypted pre-migration DB
   dump, runs committed migrations, starts the services, then checks API
   readiness and the web/admin entry points. The first deployment also
   installs the daily backup and weekly restore-drill cron entries.

`runtime.env` is read by Compose and by the API container. Put the site behind
HTTPS; Caddy requests the certificate for `PUBLIC_HOST`. The API and database
have no public port; nginx's diagnostic port is bound to Pi loopback only.

## Routine operations

From `~/deckdrive-prod` on the Pi:

```sh
bash scripts/ops/backup.sh
bash scripts/ops/restore-drill.sh
restic snapshots --tag deckdrive
docker compose --env-file runtime.env --env-file release.env -f compose.production.yml ps
```

At 02:17 UTC, cron makes a complete PostgreSQL custom-format dump, verifies
its archive listing and SHA-256, encrypts it to the external restic repository,
then retains 14 daily, 8 weekly, and 6 monthly snapshots. Sunday backups are
also tagged `weekly`. At 03:37 UTC on Sunday, the latest dump is restored into
a separate temporary database and checked for Prisma migration history. The
drill drops only that temporary database. Check `operations.log` and off-device
snapshot inventory; a missed or failed cron run needs investigation.

To roll back only application images, run `bash scripts/ops/rollback.sh`.
This swaps `release.env` with `release.previous.env` and runs the same smoke
checks. Do this only when the current DB schema is compatible with the old
image. A migration is never reversed automatically.

## Restore after data loss or Pi replacement

1. Recover `backup.env` and the restic password on the Pi. For a replacement
   Pi, also install Docker/Compose, restic, curl, flock, and Python 3, and copy
   `compose.production.yml`, `Caddyfile`, and `scripts/ops/` from the reviewed
   repository. Provide registry pull access (`docker login ghcr.io`). If
   `runtime.env` is missing, the restore command recovers it from the selected
   encrypted snapshot; inspect it and update DNS/OAuth values before exposing
   the site.
2. Run `restic snapshots --tag deckdrive` and select a snapshot ID. Then run
   `bash scripts/ops/restore.sh SNAPSHOT_ID deckdrive`, replacing `deckdrive`
   with the exact `POSTGRES_DB` value. This explicit name is the destructive
   restore confirmation. The command verifies the dump checksum, pulls the
   matching image tags from the snapshot, takes an additional safety backup
   when a current release exists, stops the application, recreates the named
   database, restores it, and checks API/web/admin health.
3. Validate an authenticated player flow and a replay before reopening the
   service. A failed restore leaves the API stopped; inspect logs and retry
   from a known-good snapshot. Keep the original encrypted snapshot.

The migration table is part of the dump. Do not run `db:reset`, edit an
already-applied migration, or run a different image version before validating
the restored snapshot. Rollback of an incompatible schema requires DB restore
from the pre-deploy snapshot as well as the matching application image.

## Verification boundary

The repository checks shell syntax, Compose rendering, Docker image builds,
and automated application tests. Live SSH, DNS, TLS issuance, off-device restic
write/read, and a Pi restore rehearsal require the configured target and
credentials. Do not treat a green repository CI run as proof of those external
operations.
