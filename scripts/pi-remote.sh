#!/usr/bin/env bash
set -Eeuo pipefail

COMMAND="${1:-}"
ARGUMENT="${2:-}"
APP_DIR="${TRADE_JOURNAL_DIR:-$HOME/trade-journal}"
STATE_DIR="${TRADE_JOURNAL_STATE_DIR:-$HOME/.local/state/trade-journal}"
BACKUP_DIR="${TRADE_JOURNAL_BACKUP_DIR:-$HOME/backups/trade-journal}"
DATABASE_PATH="${TRADE_JOURNAL_DATABASE_PATH:-$APP_DIR/api/journal.db}"
HEALTH_URL="${TRADE_JOURNAL_HEALTH_URL:-http://127.0.0.1:8877/v1/}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command on Pi: $1" >&2
    exit 1
  }
}

enter_app() {
  [[ -d "$APP_DIR/.git" ]] || {
    echo "Trade Journal checkout not found at $APP_DIR" >&2
    exit 1
  }
  cd "$APP_DIR"
}

require_clean_checkout() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Refusing to deploy over tracked changes on the Pi:" >&2
    git status --short >&2
    exit 1
  fi
}

backup_database() {
  mkdir -p "$BACKUP_DIR"
  if [[ ! -f "$DATABASE_PATH" ]]; then
    echo "No database found at $DATABASE_PATH; skipping backup."
    return 0
  fi

  local timestamp destination
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  destination="$BACKUP_DIR/journal-$timestamp.db"
  python3 - "$DATABASE_PATH" "$destination" <<'PY'
import sqlite3
import sys

source_path, destination_path = sys.argv[1:]
with sqlite3.connect(source_path) as source:
    with sqlite3.connect(destination_path) as destination:
        source.backup(destination)
print(destination_path)
PY
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'journal-*.db' -mtime +30 -delete
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
      echo "Healthy: $HEALTH_URL"
      return 0
    fi
    sleep 2
  done
  echo "Health verification failed: $HEALTH_URL" >&2
  docker compose ps >&2
  docker compose logs --tail=100 >&2
  return 1
}

deploy_revision() {
  local requested_ref="$1"
  local current_revision target_revision

  enter_app
  require_clean_checkout
  mkdir -p "$STATE_DIR"
  backup_database

  current_revision="$(git rev-parse HEAD)"
  git fetch --prune origin
  target_revision="$(git rev-parse --verify "$requested_ref^{commit}")"
  printf '%s\n' "$current_revision" > "$STATE_DIR/previous-revision"
  printf '%s\n' "$target_revision" > "$STATE_DIR/current-revision"

  echo "Deploying $target_revision (previous: $current_revision)"
  git checkout --detach "$target_revision"
  docker compose up --build --detach --remove-orphans --force-recreate
  wait_for_health
}

case "$COMMAND" in
  preflight)
    require_command git
    require_command docker
    require_command curl
    require_command python3
    docker compose version
    enter_app
    echo "Checkout: $APP_DIR"
    echo "Revision: $(git rev-parse --short HEAD)"
    git status --short --branch
    docker info --format 'Docker: {{.ServerVersion}} / {{.Architecture}}'
    [[ -f .env ]] && echo ".env: present" || echo ".env: MISSING"
    [[ -f "$DATABASE_PATH" ]] && echo "Database: $DATABASE_PATH" || echo "Database: not created yet"
    ;;
  deploy)
    require_command git
    require_command docker
    require_command curl
    require_command python3
    deploy_revision "${ARGUMENT:-origin/main}"
    ;;
  status)
    require_command docker
    require_command curl
    enter_app
    echo "Revision: $(git rev-parse --short HEAD)"
    docker compose ps
    if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
      echo "Health: OK ($HEALTH_URL)"
    else
      echo "Health: FAILED ($HEALTH_URL)"
    fi
    df -h "$APP_DIR"
    if [[ -d "$BACKUP_DIR" ]]; then
      echo "Latest backups:"
      find "$BACKUP_DIR" -maxdepth 1 -type f -name 'journal-*.db' -printf '%TY-%Tm-%Td %TH:%TM %10s %p\n' | sort -r | sed -n '1,5p'
    fi
    ;;
  logs)
    enter_app
    if [[ -n "$ARGUMENT" ]]; then
      docker compose logs --tail=200 "$ARGUMENT"
    else
      docker compose logs --tail=200
    fi
    ;;
  backup)
    require_command python3
    enter_app
    backup_database
    ;;
  rollback)
    require_command git
    require_command docker
    require_command curl
    require_command python3
    [[ -f "$STATE_DIR/previous-revision" ]] || {
      echo "No previous revision recorded at $STATE_DIR/previous-revision" >&2
      exit 1
    }
    deploy_revision "$(cat "$STATE_DIR/previous-revision")"
    ;;
  *)
    echo "Unsupported remote command: $COMMAND" >&2
    exit 2
    ;;
esac
