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
previous_candidate="$DEPLOY_DIR/release.previous.candidate.env"
printf 'API_IMAGE=%s-api@%s\nWEB_IMAGE=%s-web@%s\n' "$2" "$3" "$2" "$4" > "$candidate"
old_release=0
migration_started=0
if [[ -f "$DEPLOY_DIR/release.env" ]]; then
  cp -- "$DEPLOY_DIR/release.env" "$previous_candidate"
  old_release=1
fi

deployment_complete=0
recover_images() {
  local result=$?
  if [[ "$deployment_complete" == 1 ]]; then return "$result"; fi
  if [[ "$old_release" == 1 && ! -f "$candidate" && -f "$previous_candidate" ]]; then
    cp -- "$previous_candidate" "$RELEASE_FILE"
  fi
  if [[ "$migration_started" == 1 ]]; then
    if [[ -f "$candidate" ]]; then
      DEPLOY_RELEASE_FILE="$candidate" compose stop api web || true
    else
      compose stop api web || true
    fi
  elif [[ "$old_release" == 1 ]]; then
    compose up -d --wait --wait-timeout 180 api web caddy || true
  else
    DEPLOY_RELEASE_FILE="$candidate" compose stop api web || true
    rm -f -- "$RELEASE_FILE" "$DEPLOY_DIR/release.previous.env"
  fi
  rm -f -- "$candidate" "$previous_candidate"
  printf 'Deployment failed. Database migrations are not reversed; inspect backup before image rollback.\n' >&2
  return "$result"
}
trap recover_images EXIT

DEPLOY_RELEASE_FILE="$candidate" compose pull api web
DEPLOY_RELEASE_FILE="$candidate" compose up -d --wait --wait-timeout 180 postgres
if [[ "$old_release" == 1 ]]; then
  bash "$OPS_DIR/backup.sh" pre-deploy
else
  DEPLOY_RELEASE_FILE="$candidate" bash "$OPS_DIR/backup.sh" pre-deploy
fi
migration_started=1
DEPLOY_RELEASE_FILE="$candidate" compose run --rm --no-deps api \
  pnpm --filter @deck-drive/api prisma:migrate:deploy
DEPLOY_RELEASE_FILE="$candidate" compose up -d --wait --wait-timeout 180 api web caddy
smoke_check
bash "$OPS_DIR/install-schedule.sh"
mv -- "$candidate" "$DEPLOY_DIR/release.env"
if [[ "$old_release" == 1 ]]; then mv -- "$previous_candidate" "$DEPLOY_DIR/release.previous.env"; fi
deployment_complete=1
printf 'Deployment completed: %s\n' "$1"
