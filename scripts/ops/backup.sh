#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_command docker
require_command sha256sum
load_backup_environment
backup_release="${DEPLOY_RELEASE_FILE:-$RELEASE_FILE}"
require_file "$backup_release"
case "${1:-}" in
  ''|pre-deploy|pre-restore) ;;
  *) printf 'Usage: backup.sh [pre-deploy|pre-restore]\n' >&2; exit 2 ;;
esac
if [[ "$#" -gt 1 ]]; then printf 'Usage: backup.sh [pre-deploy|pre-restore]\n' >&2; exit 2; fi

umask 077
work_dir="$(mktemp -d "$DEPLOY_DIR/.backup-work.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

compose up -d --wait --wait-timeout 180 postgres
compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$work_dir/deckdrive.dump"
compose exec -T postgres pg_restore --list < "$work_dir/deckdrive.dump" > /dev/null
(cd "$work_dir" && sha256sum deckdrive.dump > SHA256SUMS)
cp -- "$backup_release" "$work_dir/release.env"

tag=daily
if [[ "$(date -u +%u)" == 7 ]]; then tag=weekly; fi
tags=(--tag deckdrive --tag "$tag")
if [[ "$#" == 1 ]]; then tags+=(--tag "$1"); fi
restic backup "${tags[@]}" \
  "$work_dir" "$DEPLOY_DIR/runtime.env" \
  "$DEPLOY_DIR/compose.production.yml" "$DEPLOY_DIR/Caddyfile"
restic forget --tag deckdrive --group-by '' \
  --keep-within 7d --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune
printf 'Encrypted off-device database backup completed.\n'
