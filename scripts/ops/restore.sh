#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_command docker
require_command sha256sum
load_backup_environment
if [[ "$#" != 2 || ! "$1" =~ ^[a-f0-9]{8,64}$ || ! "$2" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  printf 'Usage: restore.sh <restic snapshot ID> <confirm database name>\n' >&2
  exit 2
fi

umask 077
work_dir="$(mktemp -d "$DEPLOY_DIR/.restore-work.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
restic restore "$1" --target "$work_dir"
dump_file="$(find "$work_dir" -type f -name deckdrive.dump -print -quit)"
saved_release="$(find "$work_dir" -type f -name release.env -print -quit)"
saved_runtime="$(find "$work_dir" -type f -name runtime.env -print -quit)"
if [[ -z "$dump_file" || -z "$saved_release" || -z "$saved_runtime" ]]; then
  printf 'Snapshot is missing its database dump or runtime configuration.\n' >&2
  exit 1
fi
(cd "$(dirname -- "$dump_file")" && sha256sum --check SHA256SUMS)
compose_release="$DEPLOY_DIR/release.restore.env"
cp -- "$saved_release" "$compose_release"
if [[ ! -f "$DEPLOY_DIR/runtime.env" ]]; then cp -- "$saved_runtime" "$DEPLOY_DIR/runtime.env"; fi
chmod 600 "$DEPLOY_DIR/runtime.env" "$compose_release"

DEPLOY_RELEASE_FILE="$compose_release" compose pull api web
DEPLOY_RELEASE_FILE="$compose_release" compose up -d --wait postgres
database="$(DEPLOY_RELEASE_FILE="$compose_release" compose exec -T postgres printenv POSTGRES_DB | tr -d '\r')"
if [[ "$database" != "$2" || "$database" == postgres || "$database" == template0 || "$database" == template1 ]]; then
  printf 'Database confirmation does not match the production database.\n' >&2
  exit 1
fi

# Keep a fresh encrypted copy of the current state before any destructive step.
if [[ -f "$DEPLOY_DIR/release.env" ]]; then bash "$OPS_DIR/backup.sh"; fi
compose stop api web || true
DEPLOY_RELEASE_FILE="$compose_release" compose exec -T postgres sh -c \
  'dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
DEPLOY_RELEASE_FILE="$compose_release" compose exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$dump_file"
mv -- "$compose_release" "$DEPLOY_DIR/release.env"
compose up -d --wait api web caddy
smoke_check
printf 'Database and matching application images restored from snapshot %s.\n' "$1"
