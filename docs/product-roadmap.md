# Trade Journal Product Roadmap

Last reviewed: 2026-07-16

## Product goals

### Journal and decision record

Record free-form thoughts plus the structured thesis, entry plan, invalidation,
management, exit, and post-trade review. Brokerage history records what
happened; the journal records why.

Current:

- Journal CRUD API and streamlined daily-entry UI.
- Automatic local draft recovery for new entries.
- Optional normalized ticker tags plus note/ticker search.
- Optional context links back to positions, FlowPatrol ideas, or other research.
- Morning dashboard handoff directly into today's editor and recent entries.
- Previous-session activity assistant across all brokerage accounts. The API
  resolves the prior U.S. equity-market session or accepts an explicit date;
  broker-supplied fill groups join to order metadata while ambiguous activity
  remains ungrouped.
- Compact journal inbox with **Add to journal**, merging factual legs, ticker,
  source reference, and writing prompts without replacing existing draft notes.

Next:

- Persist **Reviewed** and **Skip** dispositions so the inbox tracks morning
  review progress without creating journal busywork.
- Add structured thesis/plan/management/outcome fields without making quick
  notes cumbersome.
- Add context-aware entry points such as **Journal this FlowPatrol idea** and
  **Add note for this position**, pre-filling the ticker, link label, and source
  path while leaving the user in control of the note.
- Link entries to positions, orders, fills, and originating research ideas with
  stable backend identifiers beyond the current optional context link.
- Add weekly summaries and rule-adherence review.

### Previous-session journal assistant

Goal: make the normal 5:20–5:40 a.m. journal useful without requiring the user
to reconstruct the prior trading session by hand. Because equity options are
usually not moving during this workflow, historical activity and entry-time
context matter more than live option quotes.

Proposed experience:

1. Open the morning journal to a compact **Previous session activity** inbox.
2. Use the prior completed U.S. market session—not simply calendar yesterday—so
   weekends and market holidays resolve correctly.
3. Show fills grouped into understandable trade events. The first contract uses
   factual labels such as opening, closing, roll, assignment, and expiration;
   opened versus added and reduced versus fully closed require position-state
   evidence and must not be guessed from fill action alone.
4. Let **Add to journal** attach an event and pre-fill a small factual summary;
   the user writes why it was done, what was expected, and what would invalidate
   the decision.
5. Offer **Reviewed** or **Skip** so a quiet day does not create busywork.

Backend responsibilities:

- Fetch and normalize orders, transactions, and fills at the existing
  `trade-journal` brokerage boundary.
- Reconstruct multi-leg and related activity conservatively, retaining raw
  identifiers and marking ambiguous grouping rather than guessing.
- Build a dated review-context read model with source timestamps, missing-data
  warnings, and stable references that can be attached to a journal entry.
- Enrich each event with available historical underlying price at execution,
  session OHLC, broad-market context, and existing position/account exposure.
- Pull Trace, FlowPatrol, or SpotGamma context only through documented APIs and
  label unavailable historical context explicitly.
- Keep imported facts separate from the user's explanation so a later refresh
  cannot silently rewrite the journal record.
Implemented foundation:

- The default date follows New York time and recurring U.S. equity-market
  holidays, including Good Friday and Juneteenth, plus known exceptional
  closures. Explicit dates remain available for historical review and backfill.
- Orders and transactions are fetched with the same bounded date across every
  account. Per-source failures and pagination truncation are explicit and
  non-fatal.
- Transactions group by Tastytrade group-fill ID first and shared order ID
  second. Transactions lacking both identifiers remain individually reviewable
  and ambiguous.
- The Angular journal loads the compact inbox independently from journal
  history. **Add to journal** preserves imported facts as editable draft text
  and adds prompts for why, expectations, and invalidation.
- **Reviewed** and **Skip** persist locally by stable activity-group ID and
  market-session date. Pending activity is the default view, completed activity
  can be shown again, and the header reports session-review progress.
- Saving a journal entry created from **Add to journal** automatically marks
  that activity reviewed and stores the journal-entry ID. A review-state write
  failure does not undo the journal save and remains visible for retry.
- **Add to journal** is context-aware: when an existing entry or unsaved draft
  is open, brokerage facts and tickers merge into that editor without replacing
  its notes. With no editor open, the action starts the normal new-entry flow.
- Multiple imported activities can be accumulated before one save and all link
  to the saved entry. Timeline events remain the optional tool for manual
  intraday observations, and the primary notes editor is sized for daily use.
- Each symbol activity now includes an entry-time context card built from the
  nearest five-minute underlying close, session OHLC, and SPY at the same time.
  The compact session chart marks the matched bar. Estimates, match distance,
  partial data, and unavailable history remain explicit.
- **Add to journal** freezes the available estimated price, session OHLC, and
  SPY comparison into factual note text so later market-data refreshes cannot
  rewrite the decision record.



Charts and screenshots:

- The first entry-time chart card is implemented with a matched activity marker.
- Next allow pasted/uploaded screenshots and preserve attachment metadata and
  provenance in the backend.
- A screenshot is supporting evidence; accessible text and normalized facts
  remain available to searches and LLM packs.

Success means the user can review the previous session and create useful linked
notes in a few minutes without retyping broker activity.

### Position list and rule supervision

Show every option position, how it is performing, and whether it follows the
trading plan.

Current:

- Positions grouped by account and expiration. Calendars and diagonals are
  inferred only when each expiration contains a single leg; existing multi-leg
  expiration groups stay intact.
- Multi-leg brokerage activity can be previewed and attached to a journal entry as one spread.
- Marks, approximate P/L, credit progress, delta/beta-delta, IV rank, and IV
  change where available.
- Account net liquidity, available/used buying power, configurable review zones,
  theta and +1-vol-point estimates as a percentage of net liquidity, and ranked
  underlying beta-delta exposure.
- Balance fetch time plus complete, partial, or unavailable data-quality status.
- Rules for 21 DTE, 50% profit, 2x loss, and low IV rank.
- Position chart expansion and a safeguarded bracket-order workflow: dry-run by
  default, mandatory UI review, explicit confirmation, and a server-side live
  trading enable flag.

Next:

1. Turn the displayed theta and vega context into configurable personal targets
   after reviewing enough history; current zones are review cues only.
2. Extend Greek exposure into ticker, sector, correlated-index, capital, and
   notional concentration once the required reference and margin data exist.
3. Assignment exposure and event/earnings risk.
4. Strategy fit by VIX regime.
5. Versioned rule results and whether warnings were followed.
6. Position/account history rather than current snapshot only.
7. Build an open-position execution ledger from transaction group-fill IDs so
   multiple spreads sharing an expiration can remain separate after partial
   closes, rolls, and contract reuse. Use opening order ID when group-fill ID
   is absent; see `docs/open-position-execution-ledger-plan.md`.

### All-account portfolio and holdings

Goal: show the complete contents of all brokerage accounts—including buy-and-hold
equities—while retaining the detailed option-management workflow.

Current:

- `GET /v1/broker/holdings` returns a versioned snapshot of every brokerage
  account and asset class, including equities, options, and empty accounts.
- Account and holding source metadata distinguishes complete, partial, and
  unavailable data. A single account failure does not remove the account or
  fail the complete response.
- The existing `GET /v1/trades` option projection and its management rules
  remain unchanged.

Next backend work:

1. Add account-level totals and allocation views without mixing capital/value
   metrics with option Greek exposure.
2. Add stable filters/read models for account and asset class, then include the
   complete account picture in portfolio-review LLM packs and history snapshots.
3. Have both all-asset and option-specific projections consume the same
   fetched source snapshot where practical, avoiding duplicate broker calls.

Planned UI work:

- Default to an all-holdings account view with filters for **All**, **Options**,
  **Stocks**, and later other supported asset classes.
- Filter by one or more of the three brokerage accounts.
- Give buy-and-hold accounts useful value, allocation, cost-basis, and P/L views;
  show expiration groups, Greeks, and management signals only where applicable.
- Keep filtering and presentation in the UI, while classification, totals,
  normalization, and risk calculations remain backend responsibilities.

### Brokerage boundary and LLM packs

Keep Tastytrade authentication and normalization here, then serve stable,
read-first contracts to the UI, OpenClaw, and market-data research.

Current:

- Accounts, balances, positions, quotes, volatility metrics, and complex-order
  client support.
- LLM-friendly position, market-data, volatility, and equity-analysis packages.
- Normalized account risk fields and explicit brokerage balance freshness/missing-data metadata in both the positions API and LLM positions pack.
- Historical price/chart features and portable JSON/Markdown handoffs.
- Wave 1 brokerage foundation: sanitized mixed-account fixtures, versioned
  holding/activity/research-context contracts, explicit source quality, read-only
  watchlist/order/transaction/historical-earnings clients, pure normalization
  services, and a public read-only all-account holdings route.

- Additive daily research-metric storage with versioned observations,
  lossless same-day upserts, and bounded history reads.
- Read-only `POST /v1/broker/research-symbol-context` batch enrichment for
  current price and IV observations, private watchlists, complete-account
  exposure, daily persistence, and five-session price/IV-rank changes.
- Per-source failures and persistence failures remain explicit without
  discarding the rest of a useful batch.
- Private watchlists have a stable list contract plus an idempotent,
  separately gated add-symbol command. Flow Ideas uses these routes through
  market-data-pipeline without duplicating brokerage authentication or
  replacement logic.

Next:

1. Add useful watchlist filters and brokerage-watchlist idea-generation views
   without changing FlowPatrol priority scoring.
2. Add the normalized all-account/all-asset portfolio summary and a broader
   trading-status model beyond the implemented option risk summary.
3. Extend the implemented session activity inbox with verified prior-session
   resolution, position-state classification, and journal attachments.
4. Nested option chains, margin requirements, order dry-run, and margin dry-run.
5. Portfolio-review and trade-review packs with freshness and missing-data
   status.
6. Document all stable cross-project contracts.

### Trade visualization

Use charts to connect market movement with the actual trade lifecycle.

Current: underlying history, chart features, manual SpotGamma context, and
position chart expansion.

Next:

- Plot entries, fills, adjustments, exits, and current option positions.
- Show thesis/invalidation levels and important journal notes.
- Allow a chart/date range to be exported with a consistent LLM data pack.
- Keep option marks and P/L clearly distinguished from underlying price.

## Future unified operator UI

TODO, intentionally not part of the current implementation queue:

- Use the `trade-journal` Angular application as the eventual shared operator
  shell for journal, positions, Trace context, FlowPatrol ideas, research
  handoffs, and later review workflows.
- Keep `trade-journal`, `market-data-pipeline`, and assistant services as
  separate backend ownership boundaries. UI consolidation must not become
  backend consolidation.
- Keep scoring, normalization, history, trading rules, source provenance,
  freshness, and safety policy in the owning backend. The frontend should
  request documented read models, render them, collect user input, and invoke
  explicit commands; it should not reproduce business logic.
- Add shared navigation, consistent theming, loading/error/quality states, and
  deep-link contracts before migrating individual screens.
- Migrate one vertical slice at a time only after its API contract is stable;
  retain the existing source UI until the replacement reaches parity.

## Stack maintenance backlog

The July 2026 modernization established the current supported baseline: Angular
21 on Node 22, Vitest and jsdom for UI tests, Python 3.11 for the API, hashed
Python dependency locks, slim multi-stage containers, a non-root API runtime,
container health checks, and guarded Pi deployment with backup and rollback.

Next maintenance batch (low risk):

- Recreate the local Python virtual environment from `requirements-dev.txt` to
  remove packages left over from earlier experiments. This does not affect the
  deployed API image, which installs only the production lock.
- Upgrade SQLAlchemy within the 2.0 line, regenerate both hashed lock files,
  and run the complete local deployment gate.
- Review compatible patch/minor updates for the current frontend and backend
  major versions without combining them with feature work.

Breaking migrations to schedule and test separately:

- Angular Material/CDK 22 and the matching Angular major-version migration.
- Tailwind CSS 4, including configuration and visual-regression review.
- pandas 3 and yfinance 1.x, with focused brokerage/market-data regression
  tests.
- Uvicorn, HTTPX, pytest, pytest-asyncio, and NumPy major or compatibility-line
  upgrades.
- Move the API from Python 3.11 to a newer supported runtime only after all
  production dependencies have ARM64 wheels and the Pi image passes the full
  gate.

Container hardening follow-up:

- Pin Python, Node, and Nginx base images by digest for reproducible releases,
  and adopt an explicit process for refreshing those digests after testing.
- Periodically review the Pi OS, Docker Engine, and Compose versions separately
  from application dependency upgrades.

## Safety boundaries

- Live brokerage credentials remain inside this project.
- Read-only contracts come before new mutation routes.
- Bracket/live-order workflows preview by default and require both explicit user
  confirmation and `LIVE_TRADING_ENABLED=true` on the server.
- Market-data or FlowPatrol interest is not trade approval.
- Exact contracts require current chain, quotes, Greeks, liquidity, catalysts,
  portfolio exposure, and an explicit risk/exit plan.

## Related documentation

- [brokerage-api-inventory.md](brokerage-api-inventory.md)
- [tastytrade-route-use-map.md](tastytrade-route-use-map.md)
- Workspace product map: `../../docs/trading-product-map.md`
