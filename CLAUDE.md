# CLAUDE.md

Guidance for coding agents working in this repository. The workspace `../AGENTS.md`
sets cross-project rules (this repo is the only brokerage boundary and the only
user-facing UI for TRACE and FlowPatrol).

## Commands

Run `make` to list targets. The common ones:

```bash
make setup        # api/.venv + npm ci, once or after lockfile changes
make dev          # Angular dev server on :4200 (API expected on :8876; /research-api proxied to mini)
make test-api     # pytest for api/ (ARGS="-k name" to narrow)
make test-ui      # type-check specs + Vitest (ARGS="--include=src/app/trace/**/*.spec.ts")
make test         # API, UI and deployment-guard suites
make contracts-update   # regenerate research contracts after a pipeline contract change
make deploy       # full gate, backup, deploy to mini, health checks (or scripts/mini-ops.sh deploy)
```

Run the API locally from `api/`: `.venv/bin/uvicorn app.main:app --reload --port 8876 --env-file ../.env`.

## Layout

- `api/app/routers/v1/`: `broker` (holdings, activity, watchlists, quote snapshots,
  market metrics, research context), `trades` (option positions, LLM summaries,
  bracket exits), `charts`, `entries` (journal), `pivots`, `spx_0dte_decisions`,
  `spread_orders` (manual SPXW 5-wide credit spreads), `hello` (`GET /v1/` health).
- `api/app/services/`: business logic. `trades_service` loads positions through
  tastytrade; `position_math`, `position_grouping`, `position_summaries` and
  `bracket_orders` are pure. `values.py` holds shared conversions; `concurrency.py`
  runs independent tastytrade reads in parallel.
- `api/app/tastytrade.py`: the only tastytrade client (OAuth refresh-token login,
  pooled session, GET retries, one refresh after a rejected token, cached accounts).
- `api/app/models.py` (SQLAlchemy, SQLite `api/journal.db`), `api/app/schemas/` (Pydantic).
- `ui/src/app/`: Angular 21 + Material (dark theme). Sections: `dashboard`, `journal`,
  `trace`, `positions`, `charts`, `pivot-tracker`, `research` (Flow Ideas, Watchlists).
  `/research-api` calls go to the market-data pipeline.

## Environment

`.env` at the repo root: `TASTYTRADE_SECRET`, `TASTYTRADE_REFRESH`, `TASTYTRADE_URL`,
`LIVE_TRADING_ENABLED` (keep false unless intended), `SPREAD_ORDER_ACCOUNT` (the one
account manual spreads may trade), `BROKERAGE_WATCHLIST_WRITES_ENABLED`,
`RESEARCH_BACKEND_URL`, `CORS_ORIGINS`. Never commit or print it.

## Docs

- `docs/development.md`: commands, contracts, TRACE component boundaries.
- `docs/mini-operations.md`: production host, deploy, health, rollback.
- `docs/brokerage-api-inventory.md`: local broker routes and client behavior.
- `docs/product-roadmap.md`: capabilities and next priorities.
