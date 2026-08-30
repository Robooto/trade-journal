#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_SCRIPT="$ROOT_DIR/scripts/mini-remote.sh"
SSH_HOST="${TRADE_JOURNAL_SSH_HOST:-roost@192.168.50.248}"
REMOTE_DIR="${TRADE_JOURNAL_REMOTE_DIR:-}"

usage() {
  cat <<'EOF'
Usage: scripts/mini-ops.sh <command> [argument]

Commands:
  check                 Run the complete local deployment gate
  preflight             Check mini prerequisites and application state
  deploy [git-ref]      Test locally, then deploy origin/main or an exact ref
  status                Show revision, containers, health, disk, and backups
  logs [service]        Show the last 200 container log lines
  backup                Create an online SQLite backup on the mini
  rollback              Deploy the revision saved before the last deployment

Environment:
  TRADE_JOURNAL_SSH_HOST      SSH alias or destination (default: roost@192.168.50.248)
  TRADE_JOURNAL_SSH_IDENTITY  Optional SSH private-key path
  TRADE_JOURNAL_REMOTE_DIR    Remote checkout (default: ~/trade-journal)
  SKIP_LOCAL_CHECK=1          Skip the local gate for deploy (emergencies only)
EOF
}

command_name="${1:-}"
argument="${2:-}"

case "$command_name" in
  check)
    exec "$ROOT_DIR/scripts/check-local.sh"
    ;;
  preflight|status|backup|rollback)
    ;;
  deploy)
    if [[ "${SKIP_LOCAL_CHECK:-0}" != "1" ]]; then
      "$ROOT_DIR/scripts/check-local.sh"
    fi
    ;;
  logs)
    ;;
  -h|--help|help|"")
    usage
    exit 0
    ;;
  *)
    echo "Unknown command: $command_name" >&2
    usage >&2
    exit 2
    ;;
esac

remote_env=()
if [[ -n "$REMOTE_DIR" ]]; then
  remote_env+=("TRADE_JOURNAL_DIR=$REMOTE_DIR")
fi

ssh_args=(-o BatchMode=yes)
if [[ -n "${TRADE_JOURNAL_SSH_IDENTITY:-}" ]]; then
  ssh_args+=(-i "$TRADE_JOURNAL_SSH_IDENTITY" -o IdentitiesOnly=yes)
fi

printf -v remote_command '%q ' \
  "${remote_env[@]}" bash -s -- "$command_name" "$argument"
ssh "${ssh_args[@]}" "$SSH_HOST" "$remote_command" < "$REMOTE_SCRIPT"
