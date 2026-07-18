# Flow Ideas Angular Parity Inventory

Last reviewed: 2026-07-18
Source UI: market-data-pipeline/ui/dashboard/flowpatrol-ui.js
Contract baseline:
market-data-pipeline/tests/fixtures/flowpatrol_api/angular-migration-contract.json

## Scope

This inventory is the RF-01 handoff for moving the **Flow Ideas** presentation
into the Trade Journal Angular application. The mini continues to own
FlowPatrol ingestion, warehouse reads, scoring, change detection, Spread ID
grouping, source quality, brokerage enrichment, and all FlowPatrol HTTP routes.

Trace remains on the mini. It is an external Research navigation destination,
not part of this migration.

## Queue parity

| Current behavior | Angular destination | API/source of truth |
| --- | --- | --- |
| Report date selector with ready/partial status | Flow Ideas filter bar | GET /dates |
| Symbol text, event, active-watch filters | URL-backed server query state | GET /{date}/candidates |
| Broad-index visibility toggle | Local display filter using row.is_index_etf | Candidate response |
| Private-watchlist and held/not-held filters | Local display filters; never infer missing data | Watchlist route + brokerage_context.exposure |
| Four visible metrics: active, persistent, unusual, changed | Queue summary cards recalculated after local filters | Candidate fields |
| Ranked candidate rows, reasons, percentiles, changes | Candidate-list component | Candidate response |
| Current-day EquityHub link | Shared New York-date utility | UI-only URL construction |
| Brokerage scan context | Candidate-list compact context | brokerage_context + brokerage_enrichment |

## Investigation parity

| Current behavior | Angular destination | API/source of truth |
| --- | --- | --- |
| Selected ticker and reason summary | Detail route/header | Candidate selection |
| Report history | History section | GET /symbols/{symbol}/history |
| FlowPatrol source-date links | History context only | History equityhub_url |
| Current-day EquityHub action | Detail action | Tested UI utility, not historical API URL |
| All evidence rows for one SpotGamma Spread ID | Contract-evidence component | GET /{date}/symbols/{symbol}/contracts |
| Report date, trading date, page, section, measure, raw row text | Every evidence row/group | Contract response |
| Quality/degraded data state | Source-status banners | Candidate enrichment and quality routes |
| Price, IV rank, five-session changes, earnings, exposure | Brokerage-context component | Candidate brokerage_context |
| Existing-list exclusion and explicit watchlist selection | Watchlist-control component | Watchlist read/write routes |

## Explicit commands

| Command | Required interaction behavior | API |
| --- | --- | --- |
| Upload report | Validate filename/size, show pending/result, refresh dates/queue on success | POST /upload |
| Add symbol to watchlist | Explicit list selection and click only; refresh watchlists/context afterward | POST /brokerage/watchlists/{name}/symbols |
| Refresh | Reload dates, candidate queue, and source state without changing scoring | Read routes above |

Selection, navigation, rendering, and page load must never cause a brokerage
write.

## Contract baseline and data states

The checked fixture covers:

- Ready, partial, and missing candidate-report responses.
- Typed endpoint schema versions and the typed missing-history error envelope.
- is_index_etf/asset_type for the current broad-index suppression policy.
- An unclassified equity candidate so the UI does not mistake false for known
  equity.
- Historical rows across two report dates.
- Two accepted evidence rows with the same spread_id.
- Partial quality output and brokerage_enrichment: not_requested.

Angular must render ready, partial, missing, enrichment disabled, unavailable,
not_requested, queue-empty, and mini-unavailable as distinct states. Null
brokerage fields remain unknown; they are never converted to zero, false, or
not held.

## Delivery mapping

- **RF-04:** queue routes, typed models, server/local filter separation,
  candidate metrics, and source states.
- **RF-05:** history, complete evidence, brokerage detail, current-date
  EquityHub, and accessible deep links.
- **RF-06:** upload and watchlist commands with mutation feedback.
- **RF-07:** compare Angular and mini Flow Ideas against the fixture's ready
  and partial report dates before retiring only the mini Flow Ideas view.

The legacy mini UI still contains its previous local symbol set during the
parity period. New Angular work must use the backend-provided is_index_etf
field instead.
