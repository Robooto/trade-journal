# Enabling Work Plan

Last reviewed: 2026-07-15

This plan orders the product roadmap by dependency. Each wave should ship as
small API-backed vertical slices. Brokerage authentication and normalization
remain in `trade-journal`; FlowPatrol and Trace remain in
`market-data-pipeline`; frontend code renders backend read models and does not
reimplement their logic.

## Dependency path

```text
broker client + sanitized fixtures
  -> all-asset holding snapshots
     -> complete portfolio, exposure, account filters, and LLM packs
  -> normalized orders, transactions, and fills
     -> previous-session journal inbox and trade chart markers
  -> watchlists + batch market context
     -> daily price/IV snapshots
     -> broker-enriched FlowPatrol and watchlist research universe

linked activity + research dispositions + journal records
  -> outcome studies and unified operator UI
```

## Wave 1: brokerage read foundation

### Packet 1A: representative source fixtures

- Keep sanitized response fixtures for all three account roles: active options,
  buy-and-hold, and mixed.
- Cover stocks, equity options, empty accounts, private watchlists, current
  market metrics, historical earnings, orders, and transactions/fills.
- Preserve representative broker field names and null/missing values.
- Add a fixture-safety test that rejects credentials and real account numbers.

### Packet 1B: shared contract metadata

Create reusable, versioned source metadata with:

- source system and endpoint;
- fetched/observed timestamps;
- `ok`, `partial`, `stale`, or `unavailable` status;
- missing fields and warnings; and
- explicit schema versions.

### Packet 1C: normalized read models

Define and test:

- `HoldingSnapshotV1` for every account and asset class;
- `BrokerActivityEventV1` for orders, fills, assignments, expirations, fees,
  and other account activity; and
- `ResearchSymbolContextV1` for watchlist membership, price and volatility
  observations, liquidity, earnings status, and existing exposure.

Contracts must keep raw observations separate from derived interpretation.

### Packet 1D: source client coverage

Add read-only Tastytrade client methods for watchlists, dated orders,
transactions, and historical earnings. Use bounded date ranges and retain
pagination metadata or warnings so incomplete history is never silent.

### Wave 1 exit criteria

- Sanitized fixtures cover the required source shapes without secrets.
- Versioned models validate representative mixed-account data.
- Missing source fields produce explicit partial/unavailable states.
- Read-only client methods have request-shape tests.
- Existing option-position and live-order behavior remains unchanged.
- The complete local deployment gate passes.

### Wave 1 progress

Completed on 2026-07-15:

- Packets 1A through 1D are implemented in the backend foundation.
- The complete gate passes with 100 backend tests and 48 frontend tests.
- The first Wave 2 slice now exposes `GET /v1/broker/holdings`, returning
  every account and asset class while preserving per-account failures as
  explicit source status.
- The existing option-position route, UI, database, and live-order behavior are
  unchanged.
- The additive `research_metric_snapshots` storage foundation now provides a
  versioned observation contract, idempotent symbol/date/source upserts, and
  bounded ordered history reads. IV rank and broker five-day IV-index change
  remain distinct fields.
- The next enabling slice is wiring daily broker observations into this store,
  followed by the batch research-symbol context API.

## Wave 2: highest-value vertical slices

1. **Implemented:** return all-account/all-asset holdings while preserving the
   current option-specific projection and management rules.
2. **Storage foundation implemented:** persist daily mark, IV index, IV rank,
   IV percentile, broker five-day IV-index change, and liquidity observations.
   Daily collection wiring remains.
3. Build a batch research-symbol context API over current and persisted data.
4. Normalize previous-session fills into opened, added, reduced, rolled, closed,
   assignment, and expiration review events.

## Wave 3: workflow features

- Enrich FlowPatrol using the documented batch broker contract.
- Add FlowPatrol, brokerage-watchlist, overlap, and combined-universe modes.
- Add journal handoffs for research ideas, positions, and activity events.
- Plot entries, fills, adjustments, exits, and current positions on charts.
- Produce portfolio-review, trade-review, and research-context LLM packs.
- Save investigate/watch/dismiss/traded dispositions.

## Wave 4: feedback and consolidation

- Measure research time saved and which context fields changed human decisions.
- Version scoring changes only after evidence shows they improve prioritization.
- Add portfolio, position, rule-adherence, and research-outcome history.
- Move stable API-backed vertical slices into the shared Angular operator shell.

## Maintenance lane

Run maintenance in bounded batches between features. SQLAlchemy 2.0 patch-line
updates are first. Angular 22, Tailwind 4, pandas 3, yfinance 1.x, Python runtime,
and other breaking upgrades remain separate migration projects.
