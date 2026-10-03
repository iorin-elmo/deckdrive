#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_command docker
require_command sha256sum
require_command python3
load_backup_environment
require_file "$RELEASE_FILE"

umask 077
work_dir="$(mktemp -d "$DEPLOY_DIR/.drill-work.XXXXXXXX")"
drill_database="deckdrive_drill_$(date -u +%s)_$$"
cleanup() {
  compose exec -T postgres dropdb --if-exists --force -U "$(compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')" "$drill_database" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

snapshot="$(restic snapshots --tag deckdrive --group-by '' --latest 1 --json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["short_id"])')"
restic restore "$snapshot" --target "$work_dir"
dump_file="$(find "$work_dir" -type f -name deckdrive.dump -print -quit)"
if [[ -z "$dump_file" ]]; then printf 'No database dump in snapshot.\n' >&2; exit 1; fi
(cd "$(dirname -- "$dump_file")" && sha256sum --check SHA256SUMS)
postgres_user="$(compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
compose exec -T postgres createdb -U "$postgres_user" "$drill_database"
compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl \
  -U "$postgres_user" -d "$drill_database" < "$dump_file"
compose exec -T postgres psql -U "$postgres_user" -d "$drill_database" \
  -v ON_ERROR_STOP=1 -Atqc 'SELECT COUNT(*) FROM _prisma_migrations' >/dev/null
printf 'Isolated restore drill passed for snapshot %s.\n' "$snapshot"
