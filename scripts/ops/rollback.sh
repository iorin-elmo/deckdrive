#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_file "$DEPLOY_DIR/release.previous.env"
require_file "$DEPLOY_DIR/release.env"
umask 077
cp -- "$DEPLOY_DIR/release.env" "$DEPLOY_DIR/release.rollback.env"
cp -- "$DEPLOY_DIR/release.previous.env" "$DEPLOY_DIR/release.env"
if ! compose up -d --wait --wait-timeout 180 api web caddy || ! smoke_check; then
  cp -- "$DEPLOY_DIR/release.rollback.env" "$DEPLOY_DIR/release.env"
  compose up -d --wait --wait-timeout 180 api web caddy || true
  printf 'Image rollback failed; inspect service logs.\n' >&2
  exit 1
fi
mv -- "$DEPLOY_DIR/release.rollback.env" "$DEPLOY_DIR/release.previous.env"
printf 'Application images rolled back. Database schema was not changed.\n'
