#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
operation_lock "$@"
require_command docker
require_command crontab
require_command curl
require_file "$DEPLOY_DIR/runtime.env"
require_file "$DEPLOY_DIR/backup.env"
if [[ "$#" != 4 || ! "$1" =~ ^[a-f0-9]{40}$ || ! "$2" =~ ^ghcr\.io/[a-z0-9._/-]+$ || ! "$3" =~ ^sha256:[a-f0-9]{64}$ || ! "$4" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  printf 'Usage: deploy.sh <40-character commit SHA> <ghcr.io/owner/repository> <api digest> <web digest>\n' >&2
  exit 2
fi

umask 077
candidate="$DEPLOY_DIR/release.candidate.env"
printf 'API_IMAGE=%s-api@%s\nWEB_IMAGE=%s-web@%s\n' "$2" "$3" "$2" "$4" > "$candidate"
old_release=0
migration_started=0
if [[ -f "$DEPLOY_DIR/release.env" ]]; then
  cp -- "$DEPLOY_DIR/release.env" "$DEPLOY_DIR/release.previous.env"
  old_release=1
else
  cp -- "$candidate" "$DEPLOY_DIR/release.env"
fi

recover_images() {
  if [[ "$old_release" == 1 ]]; then
    cp -- "$DEPLOY_DIR/release.previous.env" "$DEPLOY_DIR/release.env"
  fi
  if [[ "$migration_started" == 1 ]]; then
    compose stop api web || true
  elif [[ "$old_release" == 1 ]]; then
    compose up -d --wait --wait-timeout 180 api web caddy || true
  else
    compose stop api web || true
  fi
  rm -f -- "$candidate"
  printf 'Deployment failed. Database migrations are not reversed; inspect backup before image rollback.\n' >&2
}
trap recover_images ERR

DEPLOY_RELEASE_FILE="$candidate" compose pull api web
compose up -d --wait --wait-timeout 180 postgres
bash "$OPS_DIR/backup.sh" pre-deploy
migration_started=1
DEPLOY_RELEASE_FILE="$candidate" compose run --rm --no-deps api \
  pnpm --filter @deck-drive/api prisma:migrate:deploy
mv -- "$candidate" "$DEPLOY_DIR/release.env"
compose up -d --wait --wait-timeout 180 api web caddy
smoke_check
bash "$OPS_DIR/install-schedule.sh"
trap - ERR
printf 'Deployment completed: %s\n' "$1"
