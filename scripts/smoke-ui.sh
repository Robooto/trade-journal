#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
command -v npx >/dev/null || { echo 'npx is required for the browser smoke check.' >&2; exit 1; }
SMOKE_URL="${SMOKE_URL:-http://192.168.50.248:8877/trace}"
mkdir -p "$ROOT_DIR/output/playwright"
ARTIFACT_DIR="$(mktemp -d "$ROOT_DIR/output/playwright/smoke-XXXXXXXX")"
CLI=(npx --yes --package @playwright/cli@0.1.21 playwright-cli --session "smoke-$$")
config_args=()
if [[ -n "${PLAYWRIGHT_CONFIG:-}" ]]; then config_args+=(--config "$PLAYWRIGHT_CONFIG"); fi
cleanup() {
  local result=$?
  if [[ "$result" != 0 ]]; then echo "UI smoke failed; artifacts: $ARTIFACT_DIR" >&2; fi
  "${CLI[@]}" close >"$ARTIFACT_DIR/close.log" 2>&1 || true
}
trap cleanup EXIT
if ! "${CLI[@]}" open "$SMOKE_URL" "${config_args[@]}" > "$ARTIFACT_DIR/open.log" 2>&1; then
  cat "$ARTIFACT_DIR/open.log" >&2
  exit 1
fi
if grep -q '^### Error' "$ARTIFACT_DIR/open.log"; then
  cat "$ARTIFACT_DIR/open.log" >&2
  echo "UI smoke failed to open; artifacts: $ARTIFACT_DIR" >&2
  exit 1
fi
"${CLI[@]}" snapshot > "$ARTIFACT_DIR/before.log" 2>&1
"${CLI[@]}" run-code "$(cat "$ROOT_DIR/scripts/smoke-trace.js")" > "$ARTIFACT_DIR/result.log" 2>&1
# CLI errors can be returned as text with a zero exit status: require its success result.
if ! grep -Eq '"status": *"passed"' "$ARTIFACT_DIR/result.log"; then
  cat "$ARTIFACT_DIR/result.log" >&2
  echo "UI smoke failed; artifacts: $ARTIFACT_DIR" >&2
  exit 1
fi
"${CLI[@]}" screenshot --filename "$ARTIFACT_DIR/paper.png" > "$ARTIFACT_DIR/screenshot.log" 2>&1
sed -n '/^### Result$/,/^### Ran Playwright code$/p' "$ARTIFACT_DIR/result.log"
echo "UI smoke passed; artifacts: $ARTIFACT_DIR"
