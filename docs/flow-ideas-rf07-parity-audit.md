# Flow Ideas RF-07 parity and cutover audit

Last reviewed: 2026-08-08

## Result

Cutover is complete. Trade Journal is the only Flow Ideas presentation, and the
mini continues to own the versioned FlowPatrol APIs and backend behavior.

Trace, FlowPatrol scoring, evidence grouping policy, ingestion, and brokerage
logic remain on the mini. Angular only displays backend results and invokes
explicit upload/watchlist commands.

## Evidence-based gap audit

| Capability | Before RF-07 | RF-07 result | Evidence |
| --- | --- | --- | --- |
| Ready, partial, missing states and queue totals | Ready | Ready | Typed models, page states, deterministic parity gate |
| Date, symbol, event, active-only, index filters | Ready | Ready | URL-backed filters; backend is_index_etf |
| Watchlist and held/not-held queue filters | Missing | Ready | Watchlist read route plus nullable brokerage exposure; URL-backed |
| Compact price, IVR, five-day trend, held/watchlist scan context | Missing | Ready | Candidate brokerage scan cell |
| History dates and complete Spread ID evidence | Ready | Ready | Detail components and parity gate |
| Current New York-date EquityHub action | Ready | Ready | Shared tested URL utility |
| Upload and watchlist mutations | Ready | Ready | Explicit commands and route tests |
| TRACE presentation | Integrated | Ready | Trade Journal TRACE workspace |
| FlowPatrol scoring/classification | Backend-owned | Unchanged | No Angular scoring or symbol list |

Unknown brokerage context never matches held/not-held filters. When the
watchlist endpoint is ready it is authoritative for membership; otherwise
candidate brokerage context is used, and missing context remains unknown.

## Repeatable local gate

The deterministic test is
`ui/src/app/research/flow-ideas/flow-ideas-parity-gate.spec.ts`. It verifies:

- ready/partial/missing status coverage and advertised totals;
- broad-index classification and watchlist/portfolio filter inclusion;
- history dates and every evidence row in a shared Spread ID;
- current-date EquityHub construction;
- explicit upload and watchlist mutation routes.

Run the normal local UI gate:

```bash
docker build --target test -t trade-journal-ui-rf07-test -f ui/Dockerfile .
docker run --rm trade-journal-ui-rf07-test
```

This also runs the focused API, facade, detail, evidence, upload, watchlist, and
EquityHub specs.

## Historical live comparison evidence

The 2026-07-18 live mini audit found:

- Mini API HEAD is detached at `d12570c`, not frozen contract commit `f5a0711`.
- Ten advertised dates had matching total/row counts, no duplicate symbols, and
  no out-of-range priorities: nine partial and one ready.
- The 2026-07-16 partial report had 82 rows. TLT had eight history rows and six
  evidence rows.
- Live responses exposed no classified index rows, so the production
  `is_index_etf` filter cannot yet be validated.
- Brokerage enrichment reported disabled. The running process lacked
  `TRADE_JOURNAL_API_*` variables even though the mini `.env` has the API URL.

These findings were pre-cutover checks, not current operating instructions.
Cutover completed on 2026-08-08 after the API, brokerage enrichment,
watchlist, filter, and presentation checks were resolved. Trade Journal is the
only Flow Ideas and TRACE presentation; the mini remains the API and backend
owner.
