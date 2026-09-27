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
  deploy [git-ref]      Test clean local HEAD, then deploy that exact commit
  status                Show revision, containers, health, disk, and backups
  logs [service]        Show the last 200 container log lines
  backup                Create an online SQLite backup on the mini
  rollback              Deploy the revision saved before the last deployment

Environment:
  TRADE_JOURNAL_SSH_HOST      SSH alias or destination (default: roost@192.168.50.248)
  TRADE_JOURNAL_SSH_IDENTITY  Optional SSH private-key path
  TRADE_JOURNAL_REMOTE_DIR    Remote checkout (default: ~/trade-journal)
  SKIP_LOCAL_CHECK=1          Skip tests only; revision/checkout guards still apply (emergencies only)
EOF
}

# Check both before and after the gate: a concurrent edit or checkout invalidates it.
require_tested_checkout() {
  if [[ "$(git -C "$ROOT_DIR" rev-parse HEAD)" != "$tested_revision" ]] \
    || ! git -C "$ROOT_DIR" diff --quiet \
    || ! git -C "$ROOT_DIR" diff --cached --quiet; then
    echo "Deploy requires unchanged, committed local HEAD ($tested_revision). Commit changes and rerun." >&2
    exit 1
  fi
  local untracked
  untracked="$(git -C "$ROOT_DIR" ls-files --others --exclude-standard -- api/app api/tests ui scripts)"
  if [[ -n "$untracked" ]]; then
    echo "Untracked application/test/deployment files must be committed or removed before deploy:" >&2
    printf '%s\n' "$untracked" >&2
    exit 1
  fi
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
    tested_revision="$(git -C "$ROOT_DIR" rev-parse --verify HEAD)"
    requested_revision="$(git -C "$ROOT_DIR" rev-parse --verify --end-of-options "${argument:-HEAD}^{commit}")"
    if [[ "$requested_revision" != "$tested_revision" ]]; then
      echo "Requested revision differs from local HEAD. Check out the requested revision before deploying." >&2
      exit 1
    fi
    require_tested_checkout
    argument="$tested_revision"
    if [[ "${SKIP_LOCAL_CHECK:-0}" != "1" ]]; then
      "$ROOT_DIR/scripts/check-local.sh"
    else
      echo "WARNING: tests skipped for $tested_revision (emergency override)." >&2
    fi
    require_tested_checkout
    echo "Deploy revision: $tested_revision"
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
