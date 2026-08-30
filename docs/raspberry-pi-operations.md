# Retired Raspberry Pi deployment

Status: retired on 2026-08-30 after production moved to the mini.

The Raspberry Pi is not a deployment target. Its Trade Journal stack must
remain stopped with live trading and brokerage-watchlist writes disabled. The
legacy `scripts/pi-ops.sh` command exits with an error so an old runbook cannot
accidentally reactivate it.

Use [`mini-operations.md`](mini-operations.md) and `scripts/mini-ops.sh` for all
preflight, deployment, health, log, backup, and rollback operations. The Pi may
be retained temporarily as an offline recovery snapshot, but any future
recovery decision requires an explicit runbook and must first ensure there is
only one write-capable Trade Journal API.
