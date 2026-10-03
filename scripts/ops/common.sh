#!/usr/bin/env bash
set -euo pipefail

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd -- "$OPS_DIR/../.." && pwd)"
RELEASE_FILE="$DEPLOY_DIR/release.env"

require_file() {
  if [[ ! -f "$1" ]]; then
    printf 'Required file is missing: %s\n' "$1" >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command is missing: %s\n' "$1" >&2
    exit 1
  fi
}

operation_lock() {
  if [[ "${I00_LOCKED:-0}" == 1 ]]; then return; fi
  require_command flock
  exec flock -w 300 "$DEPLOY_DIR/.operation.lock" env I00_LOCKED=1 bash "$0" "$@"
}

compose() {
  local release_file="${DEPLOY_RELEASE_FILE:-$RELEASE_FILE}"
  require_file "$DEPLOY_DIR/runtime.env"
  require_file "$release_file"
  docker compose \
    --env-file "$DEPLOY_DIR/runtime.env" \
    --env-file "$release_file" \
    -f "$DEPLOY_DIR/compose.production.yml" "$@"
}

load_backup_environment() {
  require_file "$DEPLOY_DIR/backup.env"
  set -a
  # This is a private, operator-owned shell environment file (mode 0600).
  source "$DEPLOY_DIR/backup.env"
  set +a
  case "${RESTIC_REPOSITORY:-}" in
    s3:*|sftp:*|rest:*|rclone:*) ;;
    *) printf 'RESTIC_REPOSITORY must be an off-device S3/SFTP/REST/rclone target.\n' >&2; exit 1 ;;
  esac
  if [[ -z "${RESTIC_PASSWORD:-}" && -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
    printf 'RESTIC_PASSWORD or RESTIC_PASSWORD_FILE is required.\n' >&2
    exit 1
  fi
  require_command restic
}

smoke_check() {
  require_command curl
  local attempt path ready
  for attempt in $(seq 1 36); do
    ready=1
    for path in /health/ready / /admin/; do
      if ! curl --fail --silent --show-error --max-time 5 --output /dev/null \
        "http://127.0.0.1:8080$path"; then
        ready=0
        break
      fi
    done
    if [[ "$ready" == 1 ]]; then return; fi
    sleep 5
  done
  printf 'Health/smoke check failed after 180 seconds.\n' >&2
  return 1
}
