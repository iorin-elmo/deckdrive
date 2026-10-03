#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_command docker
require_command sha256sum
load_backup_environment
require_file "$RELEASE_FILE"

umask 077
work_dir="$(mktemp -d "$DEPLOY_DIR/.backup-work.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT

compose up -d --wait postgres
compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$work_dir/deckdrive.dump"
compose exec -T postgres pg_restore --list < "$work_dir/deckdrive.dump" > /dev/null
(cd "$work_dir" && sha256sum deckdrive.dump > SHA256SUMS)

tag=daily
if [[ "$(date -u +%u)" == 7 ]]; then tag=weekly; fi
restic backup --tag deckdrive --tag "$tag" \
  "$work_dir" "$DEPLOY_DIR/runtime.env" "$RELEASE_FILE" \
  "$DEPLOY_DIR/compose.production.yml" "$DEPLOY_DIR/Caddyfile"
restic forget --tag deckdrive --group-by host \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune
printf 'Encrypted off-device database backup completed.\n'
