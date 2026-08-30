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

Before changing revisions, create an online SQLite backup and record the
current commit:

```bash
cd /home/roost/trade-journal
mkdir -p /home/roost/backups/trade-journal
python3 scripts/sqlite-backup.py api/journal.db /home/roost/backups/trade-journal/journal-$(date -u +%Y%m%dT%H%M%SZ).db
git rev-parse HEAD
git fetch --prune origin
git checkout --detach origin/main
docker compose up --build --detach --remove-orphans
```

If `scripts/sqlite-backup.py` is unavailable, use Python's `sqlite3.Connection.backup`
API; never copy a database file while it may be receiving writes.

Host ports default to 8877 for UI and 8876 for API. A side-by-side validation
stack must use a separate checkout and copied database; changing only the
Compose project name would still bind-mount the production database. From that
isolated checkout, override ports and disable writes without editing Compose:

```bash
TRADE_JOURNAL_UI_PORT=8977 TRADE_JOURNAL_API_PORT=8976 \
  LIVE_TRADING_ENABLED=false BROKERAGE_WATCHLIST_WRITES_ENABLED=false \
  docker compose -p trade-journal-stage up --build --detach
```

## Health checks

```bash
curl --fail http://127.0.0.1:8877/
curl --fail http://127.0.0.1:8876/v1/
curl --fail http://127.0.0.1:8877/research-api/api/health
docker compose ps
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

The Raspberry Pi remains a stopped rollback target during the migration
window. Starting it requires first stopping the mini Trade Journal stack or
forcing both Pi write-safety flags to `false`.
