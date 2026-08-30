# Mini operations

The x86_64 mini at `192.168.50.248` is the production Trade Journal host. It
also runs the separately owned market-data pipeline. The projects retain
separate repositories, processes, data, and health checks.

## Runtime

- Checkout: `/home/roost/trade-journal`
- UI: `http://192.168.50.248:8877`
- Trade Journal API: `http://127.0.0.1:8876`
- Research API: `http://127.0.0.1:8765`
- Database: `/home/roost/trade-journal/api/journal.db`
- Backups: `/home/roost/backups/trade-journal`

The production `.env` is host state. Never commit, print, or copy it into a
shareable backup. Only one Trade Journal API host may have
`LIVE_TRADING_ENABLED=true` or `BROKERAGE_WATCHLIST_WRITES_ENABLED=true`.

## Deployment

From the workspace checkout, use the guarded mini operations command. It runs
the local deployment gate, creates an online SQLite backup, records the current
revision, fetches the requested revision, rebuilds the stack, and verifies both
Trade Journal and Research health:

```bash
scripts/mini-ops.sh check
scripts/mini-ops.sh preflight
scripts/mini-ops.sh deploy
```

The default SSH target is `roost@192.168.50.248`. Override it with
`TRADE_JOURNAL_SSH_HOST` and optionally set
`TRADE_JOURNAL_SSH_IDENTITY` to an SSH private-key path. Deploy a specific tag,
branch, or commit with `scripts/mini-ops.sh deploy <ref>`.

Routine operations:

```bash
scripts/mini-ops.sh status
scripts/mini-ops.sh logs
scripts/mini-ops.sh logs api
scripts/mini-ops.sh backup
scripts/mini-ops.sh rollback
```

Backups are retained for 30 days. If `scripts/sqlite-backup.py` is unavailable,
use Python's `sqlite3.Connection.backup` API; never copy a database file while
it may be receiving writes.

Host ports default to 8877 for UI and 8876 for API. A side-by-side validation
stack must use a separate checkout and copied database; changing only the
Compose project name would still bind-mount the production database. From that
isolated checkout, override ports and disable writes without editing Compose:

```bash
TRADE_JOURNAL_UI_PORT=8977 TRADE_JOURNAL_API_PORT=8976 \
  LIVE_TRADING_ENABLED=false BROKERAGE_WATCHLIST_WRITES_ENABLED=false \
  docker compose -f docker-compose.yml -f docker-compose.mini.yml \
  -p trade-journal-stage up --build --detach
```

The mini runs rootless Docker. Its override runs the API as container UID 0,
which maps to the unprivileged `roost` user on the host and permits access to
the owner-only SQLite bind mount. Do not use this override with a rootful Docker
daemon.

## Health checks

```bash
curl --fail http://127.0.0.1:8877/
curl --fail http://127.0.0.1:8876/v1/
curl --fail http://127.0.0.1:8877/research-api/api/health
docker compose -f docker-compose.yml -f docker-compose.mini.yml ps
```

Also verify journal reads and brokerage-backed account context before enabling
writes. A research outage must not make the journal API or Angular shell
unavailable.

## Backup and rollback

Keep database backups outside the checkout and replicate them to another host.
Rollback code by checking out the recorded previous commit and rebuilding the
containers. Do not restore an older database automatically: stop the API, make
another backup of current state, select the intended backup explicitly, and
run `PRAGMA integrity_check` before restart.

The retired Raspberry Pi is only a stopped, write-disabled recovery snapshot.
Do not deploy to it. See `raspberry-pi-operations.md` for the retirement guard.
