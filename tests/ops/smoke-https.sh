#!/usr/bin/env bash
set -euo pipefail

repository="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf -- "$fixture"' EXIT
mkdir -p "$fixture/scripts/ops" "$fixture/bin"
cp -- "$repository/scripts/ops/common.sh" "$fixture/scripts/ops/"
touch "$fixture/runtime.env" "$fixture/release.env" "$fixture/compose.production.yml"

cat > "$fixture/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '{"services":{"caddy":{"environment":{"PUBLIC_HOST":"game.example.test"}}}}\n'
EOF
cat > "$fixture/bin/python3" <<'EOF'
#!/usr/bin/env bash
cat > /dev/null
printf 'game.example.test\n'
EOF
cat > "$fixture/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_EVENTS"
if [[ "${MOCK_CURL_FAIL:-0}" == 1 ]]; then exit 60; fi
printf '%s' "${MOCK_CURL_STATUS:-200}"
EOF
cat > "$fixture/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$fixture/bin/"*

events="$fixture/curl-events.log"
PATH="$fixture/bin:$PATH" CURL_EVENTS="$events" \
  bash -c 'source "$1"; smoke_check' _ "$fixture/scripts/ops/common.sh"
if [[ "$(wc -l < "$events")" != 3 ]]; then
  printf 'HTTPS smoke check did not probe all three routes.\n' >&2
  exit 1
fi
for path in /health/ready / /admin/; do
  if ! grep -Fq -- "https://game.example.test$path" "$events"; then
    printf 'HTTPS smoke check skipped %s.\n' "$path" >&2
    exit 1
  fi
done
if ! grep -Fq -- '--resolve game.example.test:443:127.0.0.1' "$events" ||
  ! grep -Fq -- '--noproxy *' "$events" ||
  grep -Fq -- '--insecure' "$events"; then
  printf 'HTTPS smoke check bypassed local Caddy or TLS verification.\n' >&2
  exit 1
fi

if PATH="$fixture/bin:$PATH" CURL_EVENTS="$events" MOCK_CURL_FAIL=1 \
  bash -c 'source "$1"; smoke_check' _ "$fixture/scripts/ops/common.sh" \
  > "$fixture/failure.log" 2>&1; then
  printf 'HTTPS smoke check accepted a TLS failure.\n' >&2
  exit 1
fi

if PATH="$fixture/bin:$PATH" CURL_EVENTS="$events" MOCK_CURL_STATUS=302 \
  bash -c 'source "$1"; smoke_check' _ "$fixture/scripts/ops/common.sh" \
  > "$fixture/redirect.log" 2>&1; then
  printf 'HTTPS smoke check accepted a redirect instead of a healthy route.\n' >&2
  exit 1
fi

printf 'HTTPS smoke checks passed.\n'
