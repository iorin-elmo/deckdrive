#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
require_command crontab
if [[ "$DEPLOY_DIR" =~ [[:space:]] ]]; then
  printf 'Deployment directory must not contain whitespace for cron scheduling.\n' >&2
  exit 1
fi
umask 077
schedule="$(mktemp "$DEPLOY_DIR/.backup-cron.XXXXXXXX")"
trap 'rm -f -- "$schedule"' EXIT
crontab -l 2>/dev/null | sed '/# deckdrive-operations$/d' > "$schedule" || true
printf '17 2 * * * PATH=/usr/local/bin:/usr/bin:/bin /bin/bash %s/scripts/ops/backup.sh >> %s/operations.log 2>&1 # deckdrive-operations\n' \
  "$DEPLOY_DIR" "$DEPLOY_DIR" >> "$schedule"
printf '37 3 * * 0 PATH=/usr/local/bin:/usr/bin:/bin /bin/bash %s/scripts/ops/restore-drill.sh >> %s/operations.log 2>&1 # deckdrive-operations\n' \
  "$DEPLOY_DIR" "$DEPLOY_DIR" >> "$schedule"
crontab "$schedule"
printf 'Daily backup and weekly isolated restore drill scheduled.\n'
