#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -x api/.venv/bin/python ]]; then
  PYTHON_BIN=api/.venv/bin/python
else
  PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

echo "==> Development dependencies"
"$PYTHON_BIN" -m pip install --require-hashes -r api/requirements-dev.txt

echo "==> Backend tests"
PYTHONPATH=api "$PYTHON_BIN" -m pytest api/tests -q

echo "==> Python dependency consistency"
"$PYTHON_BIN" -m pip check

NPM_BIN="$(command -v npm 2>/dev/null || true)"
if [[ -n "$NPM_BIN" && "$NPM_BIN" != /mnt/* ]]; then
  echo "==> UI clean install"
  npm --prefix ui ci

  echo "==> UI production build"
  npm --prefix ui run build -- --configuration=production

  echo "==> UI spec type-check"
  npm --prefix ui exec -- tsc -p tsconfig.spec.json --noEmit
else
  echo "==> UI build and type-check in Linux container"
  docker build --target builder -f ui/Dockerfile -t trade-journal-ui-check:local .
  docker run --rm trade-journal-ui-check:local \
    npm exec -- tsc -p tsconfig.spec.json --noEmit
fi

echo "==> Compose configuration"
docker compose config --quiet

if [[ "${CHECK_DOCKER_BUILD:-0}" == "1" ]]; then
  echo "==> Production container builds"
  docker compose build
fi

echo "Local deployment checks passed."
