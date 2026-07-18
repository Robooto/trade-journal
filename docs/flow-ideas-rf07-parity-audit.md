# Flow Ideas RF-07 parity and cutover audit

Last reviewed: 2026-07-18

## Result

Angular now has code-level parity with the current mini Flow Ideas presentation.
The mini Flow Ideas UI remains in place. Cutover is **not approved yet** because
the live mini is behind the frozen contract and its running process does not
have brokerage enrichment configured.

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
| Trace | Intentionally external | Unchanged | Trace on mini link |
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

## Live comparison evidence and blockers

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

Before cutover:

1. Deploy the frozen/current market-data-pipeline contract to the mini.
2. Launch the API with brokerage environment variables and verify ready/partial
   enrichment plus watchlist reads.
3. Smoke a classified index row and bookmark reloads for watchlist/portfolio
   filters through the Pi proxy.
4. Compare the same ready and partial dates in both UIs.
5. Keep the mini UI through the parity period; remove only Flow Ideas later.
