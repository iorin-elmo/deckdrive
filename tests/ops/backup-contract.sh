#!/usr/bin/env bash
set -euo pipefail

repository="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/scripts/ops" "$fixture/bin"
cp -- "$repository/scripts/ops/common.sh" "$repository/scripts/ops/backup.sh" "$fixture/scripts/ops/"
touch "$fixture/runtime.env" "$fixture/compose.production.yml" "$fixture/Caddyfile"
printf 'RESTIC_REPOSITORY=sftp:backup.example:/deckdrive\nRESTIC_PASSWORD=test-password\n' > "$fixture/backup.env"
printf 'API_IMAGE=old-api\nWEB_IMAGE=old-web\n' > "$fixture/release.env"
printf 'API_IMAGE=new-api\nWEB_IMAGE=new-web\n' > "$fixture/release.candidate.env"

cat > "$fixture/bin/docker" <<'EOF'
#!/usr/bin/env bash
if [[ " $* " == *' pg_dump '* ]]; then printf 'mock PostgreSQL dump'; fi
EOF
cat > "$fixture/bin/restic" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" != backup ]]; then exit 0; fi
for input in "$@"; do
  if [[ -d "$input" && -f "$input/release.env" ]]; then
    cmp -- "$input/release.env" "$EXPECTED_RELEASE"
    [[ -s "$input/deckdrive.dump" ]]
    (cd "$input" && sha256sum --check SHA256SUMS > /dev/null)
    touch "$BACKUP_VERIFIED"
    exit 0
  fi
done
printf 'Backup omitted the matching release metadata.\n' >&2
exit 1
EOF
chmod +x "$fixture/bin/docker" "$fixture/bin/restic"

for release in release.env release.candidate.env; do
  marker="$fixture/backup-verified"
  rm -f -- "$marker"
  PATH="$fixture/bin:$PATH" I00_LOCKED=1 \
    EXPECTED_RELEASE="$fixture/$release" BACKUP_VERIFIED="$marker" \
    DEPLOY_RELEASE_FILE="$fixture/$release" \
    bash "$fixture/scripts/ops/backup.sh" pre-deploy > /dev/null
  if [[ ! -f "$marker" ]]; then
    printf 'Backup contract was not verified for %s.\n' "$release" >&2
    exit 1
  fi
done

printf 'Backup release pairing checks passed.\n'
