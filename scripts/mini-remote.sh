#!/usr/bin/env bash
set -Eeuo pipefail

COMMAND="${1:-}"
ARGUMENT="${2:-}"
APP_DIR="${TRADE_JOURNAL_DIR:-$HOME/trade-journal}"
STATE_DIR="${TRADE_JOURNAL_STATE_DIR:-$HOME/.local/state/trade-journal}"
BACKUP_DIR="${TRADE_JOURNAL_BACKUP_DIR:-$HOME/backups/trade-journal}"
DATABASE_PATH="${TRADE_JOURNAL_DATABASE_PATH:-$APP_DIR/api/journal.db}"
HEALTH_URL="${TRADE_JOURNAL_HEALTH_URL:-http://127.0.0.1:8877/v1/}"
RESEARCH_HEALTH_URL="${TRADE_JOURNAL_RESEARCH_HEALTH_URL:-http://127.0.0.1:8877/research-api/api/health}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.mini.yml)

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command on mini: $1" >&2
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
    echo "Refusing to deploy over tracked changes on the mini:" >&2
    git status --short >&2
    exit 1
  fi
}

require_rootless_docker() {
  docker info --format '{{json .SecurityOptions}}' | grep -q 'rootless' || {
    echo "docker-compose.mini.yml requires the mini's rootless Docker daemon." >&2
    exit 1
  }
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
  python3 scripts/sqlite-backup.py "$DATABASE_PATH" "$destination"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'journal-*.db' -mtime +30 -delete
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null \
      && curl --fail --silent --show-error "$RESEARCH_HEALTH_URL" >/dev/null; then
      echo "Healthy: $HEALTH_URL"
      echo "Research healthy: $RESEARCH_HEALTH_URL"
      return 0
    fi
    sleep 2
  done
  echo "Health verification failed: $HEALTH_URL" >&2
  "${COMPOSE[@]}" ps >&2
  "${COMPOSE[@]}" logs --tail=100 >&2
  return 1
}

deploy_revision() {
  local requested_ref="$1"
  local current_revision target_revision

  enter_app
  require_clean_checkout
  require_rootless_docker
  mkdir -p "$STATE_DIR"
  backup_database

  current_revision="$(git rev-parse HEAD)"
  git fetch --prune origin
  target_revision="$(git rev-parse --verify "$requested_ref^{commit}")"
  printf '%s\n' "$current_revision" > "$STATE_DIR/previous-revision"
  printf '%s\n' "$target_revision" > "$STATE_DIR/current-revision"

  echo "Deploying $target_revision to mini (previous: $current_revision)"
  git checkout --detach "$target_revision"
  "${COMPOSE[@]}" up --build --detach --remove-orphans --force-recreate
  wait_for_health
}

case "$COMMAND" in
  preflight)
    require_command git
    require_command docker
    require_command curl
    require_command python3
    enter_app
    require_rootless_docker
    "${COMPOSE[@]}" config --quiet
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
    "${COMPOSE[@]}" ps
    curl --fail --silent --show-error "$HEALTH_URL" >/dev/null && echo "Health: OK ($HEALTH_URL)"
    curl --fail --silent --show-error "$RESEARCH_HEALTH_URL" >/dev/null && echo "Research: OK ($RESEARCH_HEALTH_URL)"
    df -h "$APP_DIR"
    if [[ -d "$BACKUP_DIR" ]]; then
      echo "Latest backups:"
      find "$BACKUP_DIR" -maxdepth 1 -type f -name 'journal-*.db' -printf '%TY-%Tm-%Td %TH:%TM %10s %p\n' | sort -r | sed -n '1,5p'
    fi
    ;;
  logs)
    enter_app
    if [[ -n "$ARGUMENT" ]]; then
      "${COMPOSE[@]}" logs --tail=200 "$ARGUMENT"
    else
      "${COMPOSE[@]}" logs --tail=200
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
