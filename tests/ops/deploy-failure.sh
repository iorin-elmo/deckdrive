#!/usr/bin/env bash
set -euo pipefail

repository="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/scripts/ops" "$fixture/bin"
cp -- "$repository/scripts/ops/common.sh" "$repository/scripts/ops/deploy.sh" "$fixture/scripts/ops/"
touch "$fixture/runtime.env" "$fixture/backup.env"

cat > "$fixture/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_EVENTS"
if [[ "$MOCK_DOCKER_FAIL" == pull && " $* " == *' pull api web '* ]]; then exit 1; fi
if [[ "$MOCK_DOCKER_FAIL" == migration && " $* " == *' run --rm --no-deps api '* ]]; then exit 1; fi
if [[ " $* " == *' config --format json '* ]]; then
  printf '{"services":{"caddy":{"environment":{"PUBLIC_HOST":"game.example.test"}}}}\n'
fi
EOF
cat > "$fixture/bin/crontab" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$fixture/bin/python3" <<'EOF'
#!/usr/bin/env bash
cat > /dev/null
printf 'game.example.test\n'
EOF
cat > "$fixture/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$MOCK_DOCKER_FAIL" == smoke ]]; then exit 60; fi
EOF
cat > "$fixture/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$fixture/bin/"*
cat > "$fixture/scripts/ops/backup.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

run_failing_deploy() {
  local mode="$1"
  : > "$fixture/docker-events.log"
  if PATH="$fixture/bin:$PATH" I00_LOCKED=1 \
    MOCK_DOCKER_FAIL="$mode" DOCKER_EVENTS="$fixture/docker-events.log" \
    bash "$fixture/scripts/ops/deploy.sh" \
    0123456789abcdef0123456789abcdef01234567 \
    ghcr.io/example/deckdrive \
    "sha256:$(printf 'a%.0s' {1..64})" \
    "sha256:$(printf 'b%.0s' {1..64})" > "$fixture/deploy.log" 2>&1; then
    printf 'Expected the mocked image pull to fail.\n' >&2
    exit 1
  fi
}

run_failing_deploy pull
if [[ -e "$fixture/release.env" || -e "$fixture/release.candidate.env" || -e "$fixture/release.previous.env" ]]; then
  ls -la "$fixture" >&2
  cat "$fixture/deploy.log" >&2
  printf 'A failed first deployment left release metadata behind.\n' >&2
  exit 1
fi

printf 'API_IMAGE=old-api\nWEB_IMAGE=old-web\n' > "$fixture/release.env"
printf 'API_IMAGE=older-api\nWEB_IMAGE=older-web\n' > "$fixture/release.previous.env"
cp -- "$fixture/release.env" "$fixture/current.expected"
cp -- "$fixture/release.previous.env" "$fixture/previous.expected"
run_failing_deploy pull
if ! cmp -s "$fixture/release.env" "$fixture/current.expected" ||
  ! cmp -s "$fixture/release.previous.env" "$fixture/previous.expected" ||
  [[ -e "$fixture/release.candidate.env" || -e "$fixture/release.previous.candidate.env" ]]; then
  printf 'A failed update changed the active release.\n' >&2
  exit 1
fi

run_failing_deploy migration
if ! awk '
  /stop --timeout 30 api web/ { if (!stop) stop = NR }
  /run --rm --no-deps api/ { if (!migration) migration = NR }
  END { exit !(stop && migration && stop < migration) }
' "$fixture/docker-events.log"; then
  printf 'Migration ran before the old application stopped.\n' >&2
  exit 1
fi
if ! cmp -s "$fixture/release.env" "$fixture/current.expected" ||
  ! cmp -s "$fixture/release.previous.env" "$fixture/previous.expected"; then
  printf 'Failed migration changed release metadata.\n' >&2
  exit 1
fi

run_failing_deploy smoke
if ! cmp -s "$fixture/release.env" "$fixture/current.expected" ||
  ! cmp -s "$fixture/release.previous.env" "$fixture/previous.expected" ||
  [[ -e "$fixture/release.candidate.env" || -e "$fixture/release.previous.candidate.env" ]]; then
  printf 'Failed HTTPS smoke check promoted an unhealthy release.\n' >&2
  exit 1
fi

printf 'Deployment failure recovery checks passed.\n'
