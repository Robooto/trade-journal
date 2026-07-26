# Research Frontend Migration Plan

Last reviewed: 2026-07-18

## Outcome

Move Flow Ideas into the `trade-journal` Angular application so journal,
positions, and research share one operator UI. Keep FlowPatrol ingestion,
ranking, history, evidence, brokerage enrichment, and APIs in
`market-data-pipeline` on the mini. Keep the existing Trace UI on the mini.

This is a presentation migration, not a backend consolidation. Reach current
Flow Ideas parity before adding new features.

## Ownership and runtime boundary

```text
Browser
  -> Raspberry Pi trade-journal Nginx / Angular
     -> /v1/*           -> trade-journal API
     -> /research-api/* -> mini market-data-pipeline :8765
  -> SpotGamma EquityHub through an explicit external action

Mini market-data-pipeline
  -> FlowPatrol ingestion, warehouse, ranking, history, evidence, API
  -> trade-journal APIs for brokerage enrichment and watchlist commands
  -> existing Trace UI and API (unchanged)
```

Angular owns navigation, layout, formatting, URL state, selection, and explicit
commands. It must not duplicate FlowPatrol scoring, Spread ID grouping,
brokerage authentication, portfolio calculations, quality decisions, or policy.

## Network approach

Use same-origin `/research-api/api/flowpatrol/...`. The UI Nginx container
strips `/research-api/` and proxies to a deployment-configured upstream such as
`http://192.168.50.248:8765`. Use an Nginx template and Compose variable such
as `RESEARCH_BACKEND_URL`; do not compile the mini address into TypeScript.

The proxy must preserve `/v1/`, allow PDFs up to 20 MB, give synchronous
processing a bounded timeout, and isolate mini failures to Research. Provide a
development proxy for `ng serve`. Do not relay FlowPatrol through the
trade-journal Python API: that would blur ownership and add a needless hop.

## Angular feature structure

Create one lazy-loaded Research feature with Flow Ideas as its first slice:

```text
src/app/research/
  research.module.ts
  research-routing.module.ts
  research-shell/
  shared/                         # research-only reusable UI/contracts
  flow-ideas/
    data-access/
      flow-ideas-api.service.ts
      flow-ideas.facade.ts
    models/
    pages/
      flow-ideas-page/
      flow-idea-detail-page/
    components/
      flow-filters/
      candidate-list/
      candidate-detail/
      report-history/
      contract-evidence/
      brokerage-context/
      watchlist-control/
      report-upload/
    utilities/equity-hub-url.ts
```

The API service owns HTTP, the facade owns orchestration/state, and components
render. Use Angular signals plus RxJS rather than adding NgRx. Keep Flow models
local until another module truly shares them. Retain nulls and source status;
never turn missing into zero or false. Cancel stale detail requests with
`switchMap`. Ranking, reasons, watch state, evidence grouping, and enrichment
come from the backend.

## Routes and navigation

```text
/research/flow-ideas
/research/flow-ideas/:tradingDate/:symbol
```

Keep useful filters in query parameters so queues are bookmarkable. Persist only
harmless UI preferences locally. Add **Research** to the journal navigation,
with Flow Ideas in-app and **Trace on mini** as a labeled external link. Do not
embed or migrate Trace in this queue.

## Layout and interaction

Use the journal dark visual system while preserving the dashboard's density.

Desktop order: title/status/actions; compact filters; summary metrics and source
banners; then a master/detail workspace with ranked candidates left and ticker
detail right. On narrow screens show the queue first, navigate to the detail
route, collapse filters, and use cards when a table no longer reads well.

Upload and watchlist writes require explicit clicks and visible pending/result
states. Loading, empty, partial, missing-report, and mini-unavailable states are
distinct. Show every row in a supplied SpotGamma Spread ID group with report
date, trading-data date, section, page, measure, and raw evidence. Generate
EquityHub links with the current New York date through one tested utility.
Preserve keyboard access, visible focus, semantic headings, and live statuses.

## Contract preparation

Current endpoints cover functional parity. Harden these details with the client:

1. Check representative ready, partial, missing, and error JSON into fixtures.
2. Add or document schema versions and a consistent safe error shape.
3. Return `asset_type` or `is_index_etf` so Angular stops hard-coding XSP,
   SPY, SPX, IWM, and QQQ.
4. Retain enrichment and quality status at queue and detail levels.
5. Verify upload size, timeout, conflict, and validation through the Pi proxy.

Local display filters can remain client-side for parity. If volume grows, add
backend filters rather than reproducing data rules in Angular.

## Implementation work queue

### Implementation status — 2026-07-18

Completed: **RF-01** contract fixtures and parity inventory; **RF-02** proxy
and failure isolation; **RF-03** Research shell/navigation; **RF-04** typed
queue read path, filters, metrics, and source states; and **RF-05** dated
ticker investigation with history, complete Spread ID evidence, read-only
brokerage context, and a current-New-York-date EquityHub action; and **RF-06**
explicit report-upload and private-watchlist commands; and **RF-07 code parity**
including bookmarkable watchlist/portfolio filters, compact brokerage scan
context, and a deterministic local parity gate.

Cutover remains pending. The live mini must first receive the frozen/current
contract, start with brokerage enrichment environment variables, expose a
classified index row for validation, and pass the Pi-to-mini browser comparison.
See `docs/flow-ideas-rf07-parity-audit.md`. Keep the mini Flow Ideas view
during this parity period.

### RF-01 - Contract fixtures and parity inventory

Freeze representative fixtures and inventory every current filter, metric,
field, detail, upload, watchlist, and EquityHub action. Add classification and
schema/error metadata where needed.

### RF-02 - Research proxy and failure isolation

Add configurable production/development proxies, upload size and timeout. Smoke
test Pi-to-mini access and verify a stopped mini does not break journal or
positions.

### RF-03 - Research shell and navigation

Add lazy-loaded routes, navigation, dark responsive page primitives, and the
external Trace link.

### RF-04 - Typed Flow Ideas read path

Implement models, API service, facade, cancellation, URL state, dates, queue,
metrics, filters, and all data states. Separate server query filters from local
display filters.

### RF-05 - Symbol investigation detail

Add report history, changes, Greeks, brokerage/earnings/quality context,
research links, stable deep links, current-date EquityHub, and every Spread ID
evidence row.

### RF-06 - Explicit commands

Add report upload with validation, progress, conflict, refresh, and retry. Add
idempotent private-watchlist commands. Never mutate brokerage state on
selection, navigation, or page load.

### RF-07 - Parity, cutover, and cleanup

Run the deterministic local parity gate and a Pi-to-mini smoke test. Compare old
and new UIs on the same ready and partial dates. The Angular implementation is
code-complete, but cutover is blocked by the live backend revision, disabled
brokerage enrichment, and unvalidated live index classification documented in
`docs/flow-ideas-rf07-parity-audit.md`. Keep mini Flow Ideas during a short
parity period, then remove only its Flow presentation while retaining Trace and
every API.

## Test and acceptance

Use checked fixtures for API tests; facade tests for filters, stale requests,
partial data, and outages; component tests for evidence completeness, source
warnings, upload, watchlists, accessibility, and narrow layouts; and New York
date-boundary tests for EquityHub. Run the local production/deployment gate and
a parity script; CI remains out of scope.

Acceptance requires full current feature parity, no scoring or brokerage client
in Angular, no mini address in TypeScript, reload-safe detail URLs, explicit
quality/outage states, successful valid uploads up to 20 MB, complete Spread ID
evidence, journal/positions working while mini is down, and Trace unchanged.

## Future research modules

This structure can later support brokerage-watchlist research, an earnings/event
queue, longer-window ticker comparison, and a saved research inbox that hands
off to the journal. Trace gets its own future parity plan. Do not build a dynamic
plugin framework yet; a small route/navigation registry and source-quality
components are enough until multiple modules prove a broader abstraction.

### Experimental Charm slice

The first-class TRACE workspace includes Charm at `/trace/charm`. Angular owns only session and
capture selection, chart rendering, formatting, and explicit quality labels.
The mini owns TRACE Delta ingestion, Charm calculation, source selection,
zero-crossing interpolation, robust scale metadata, freshness, and quality.
The page is deliberately excluded from Flow Ideas scoring and keeps visual
parity marked pending. The standalone mini dashboard remains the parity baseline while its views
migrate incrementally.
## TRACE migration readiness — 2026-07-25

The first TRACE preparation wave is complete in `market-data-pipeline`:

- **TR-01:** the dashboard read models have additive schema versions and a
  documented contract inventory;
- **TR-02:** `GET /api/trace/sessions` supplies newest-first session discovery,
  and TRACE responses expose `ready`, `partial`, or `missing` status with
  generated time, freshness, explicit quality fields, and warning codes; and
- **TR-03:** TRACE presentation joins use `(date, capture_id)`, with fixtures
  that reuse a capture ID on a second date plus deterministic ready, partial,
  missing, current-session, and historical-session tests.

### TR-04 — Angular TRACE foundation — completed 2026-07-26

The first-class TRACE workspace now exposes `/trace/overview` with typed
versioned models, a same-origin API service, and a cancellation-safe facade. Session discovery picks
the newest available date, independent source loads preserve useful partial data,
and the readiness page shows backend status, quality, freshness, capture counts,
and per-resource warnings without recreating analytical rules in Angular. API,
facade, routing, and component tests cover the boundary.

The sidebar places TRACE directly below Journal, while Flow Ideas and Watchlists
remain grouped under Research; legacy `/research/trace` and `/research/charm`
URLs redirect to the new workspace.

### TR-05 — Timeline and glanceable snapshot — completed 2026-07-26

The overview opens at the latest capture and provides bounded previous/next and
range navigation across the session. Its snapshot renders backend-provided spot,
SPX and equities HIRO, flow relationship, walls, shelf, gamma structure, and
capture-matched realized volatility. Responsive content-box and flex boundaries
prevent the TRACE route from widening the application viewport. No TRACE
calculations, classifications, freshness decisions, or quality rules moved into
Angular.

### TR-06 — Signed GEX structure map — completed 2026-07-26

The overview now renders the session's signed GEX structure from the versioned
histogram contract: positive nodes are circles, negative nodes are diamonds,
and color comes directly from the backend node state. Near-price/full-day and
key-node/all-node controls change presentation only; they do not reclassify or
score the source data. The responsive SVG has no fixed minimum canvas width, so
it uses the additional workspace released by the collapsed sidebar without
reintroducing horizontal page scroll.

The selected timeline capture also requests its versioned gamma-around-spot
profile. Capture and session changes cancel stale requests, and loading,
unavailable, and error states remain explicit. Angular displays the backend
spot and cross-spot slope but does not calculate gamma, node state, or source
quality.

### TR-07 — Price structure and HIRO trends — completed 2026-07-26

The overview now renders two responsive session trends from the existing
versioned timeseries contract. Price, put wall, hedge wall, call wall, and shelf
share a focused near-price or full-range chart; SPX HIRO and equities HIRO share
a symmetric zero-centered scale with spot on a separate right axis. Line pattern
and tone distinguish series without relying on color alone.

Both charts use the same capture grain and plot margins, so their vertical
selection cursors stay aligned with the timeline, keyboard navigation, snapshot,
and Signed GEX map. Selected HIRO values and per-minute rates are read directly
from the backend. Angular performs only chart scaling and formatting; it does
not recreate the mini's recent-window direction classification or add trading
interpretation.

### TR-08 — Exact capture inspection and parity audit — in progress

A collapsed capture-history table now exposes every versioned timeline row and
synchronizes timestamp selection through the shared facade. Gamma around spot
now restores signed bars beneath the curve, closing a semantic difference found
against the legacy implementation. Contract, interaction, responsive
containment, and intentional differences are recorded in
`docs/trace-tr08-parity-audit.md`.

Keep the standalone mini TRACE page and Legacy TRACE link as the visual parity
baseline and rollback path. Cutover remains blocked until the deployed
side-by-side checklist passes and the user confirms that the Angular charts
preserve the research meaning they rely on. The mini APIs remain in place after
any presentation cutover.
