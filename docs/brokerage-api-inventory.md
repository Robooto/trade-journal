# Brokerage API Inventory

This document tracks the broker routes available through the brokerage provider
and the local `trade-journal` API contracts that should expose them safely to
other projects.

`trade-journal` owns brokerage authentication and broker-backed normalization.
Other projects should call documented local APIs or shared clients instead of
duplicating broker access.

For the current tastytrade route analysis and recommended build order, see
[`tastytrade-route-use-map.md`](tastytrade-route-use-map.md).

## Discovery Goals

- List available broker routes and required parameters.
- Capture response shapes with sensitive values removed.
- Identify which routes are read-only and which can mutate account state.
- Decide which routes should become stable local endpoints.
- Document rate limits, caching expectations, and error shapes.

## Priority Routes

### Authentication And Account Identity

- Session/login route.
- Customer profile route.
- Account list route.
- Account permissions and account type metadata.

### Account And Risk Context

- Balances.
- Buying power.
- Portfolio margin or margin requirement details.
- Net liquidation value.
- Cash and sweep balances.

### Positions

- Positions by account.
- Position Greeks, if available.
- Cost basis, quantity, mark, P/L, and expiration metadata.
- Aggregate positions across accounts for assistant-friendly review.

### Orders

- Open orders.
- Historical orders.
- Order details by id.
- Canceled/rejected order details.

### Trades And Transactions

- Fills.
- Trade history.
- Cash transactions.
- Fees and commissions, if available.

### Market Data

- Quotes.
- Option chains.
- Greeks.
- Implied volatility.
- Open interest and volume.
- Expiration metadata.

## Local Endpoint Candidates

Document stable local endpoints here as they are implemented.

```text
GET /v1/broker/holdings
GET /v1/broker/activity-inbox[?session_date=YYYY-MM-DD]
PUT /v1/broker/activity-disposition
POST /v1/broker/research-symbol-context
GET /v1/broker/watchlists
POST /v1/broker/watchlists/{watchlist_name}/symbols
GET /v1/broker/accounts
GET /v1/broker/summary
GET /v1/broker/positions
GET /v1/broker/orders
GET /v1/broker/trades
GET /v1/broker/quotes?symbols=SPY,QQQ
GET /v1/broker/options/{symbol}/chain
```

## Wave 1 Foundation Status

Implemented backend foundations:

- `HoldingSnapshotV1` preserves every brokerage account and asset class,
  including empty accounts, while the existing option-group projection remains
  unchanged.
- `BrokerActivityEventV1` retains transaction, order, and group-fill IDs,
- The journal activity card previews every leg in an explicit group fill and
  attaches the complete spread to the open entry.
- Position groups expose `expiration_dates`, `strategy_label`,
  `strategy_confidence`, and `grouping_source`. Broker group-fill provenance is
  preferred; only unambiguous calendar/diagonal pairs are inferred.
  signed values, fees, source timestamps, and explicit grouping ambiguity.
- `BrokerActivityInboxV1` defaults to the prior U.S. equity-market session in
  New York time or accepts an explicit historical date. It groups normalized
  transactions only when Tastytrade provides a group-fill identifier, joins
  matching order metadata, preserves every normalized leg, and reports source
  failures without discarding activity from other available sources/accounts.
- `BrokerActivityDispositionV1` persists Reviewed/Skip workflow state locally
  by activity-group ID and market-session date, optionally linking the resulting
  journal entry. Inbox responses include each event's status and aggregate
  pending/reviewed/skipped counts.
- `BrokerActivityMarketContextV1` enriches symbol activity with cached
  five-minute Yahoo bars, the nearest estimated underlying close, match
  distance, session OHLC/change, SPY-at-activity context, and a compact bar
  series. The original activity remains available when chart history fails;
  context status and warnings distinguish estimated, session-only, and
  unavailable data.
- `ResearchSymbolContextV1` joins watchlist membership, current price and IV
  observations, existing exposure, earnings availability, and per-source
  quality status.
- Read-only client methods cover private watchlists, bounded dated orders,
  bounded dated transactions, pagination metadata, and historical earnings.
- `GET /v1/broker/holdings` exposes the normalized holding snapshot without
  changing the option-specific `GET /v1/trades` contract. A failure to list
  accounts returns `502`; a per-account position failure preserves that
  account with `unavailable` source status and a safe warning.
- Sanitized fixtures represent options, buy-and-hold, and mixed account roles.

- `POST /v1/broker/research-symbol-context` accepts up to 100 explicit
  symbols, joins current price/volatility, private watchlists, and all-account
  exposure, persists valid daily observations, and adds five-session price and
  IV-rank changes after six dated observations exist.

- `GET /v1/broker/watchlists` returns every private list with its current
  symbols and whether explicit watchlist writes are enabled.
- `POST /v1/broker/watchlists/{watchlist_name}/symbols` performs an idempotent
  add only when `BROKERAGE_WATCHLIST_WRITES_ENABLED=true`. Because Tastytrade's
  update route replaces the complete watchlist, the client fetches the latest
  list, preserves all entries and properties, appends the symbol, and submits
  the full replacement.

Current IV rank and the broker's five-day IV-index change remain separate
observations. Upcoming earnings remain explicitly unavailable until a verified
forward-looking source is added.

## Safety Rules

- Start read-only.
- Do not expose live order placement to other projects until explicit policy
  gates exist.
- Keep credentials and broker session handling inside `trade-journal`.
- Redact account numbers, tokens, and personally identifiable fields from saved
  samples.
- Update `/home/boots/code/trading/docs/api-contracts.md` when a route becomes
  a cross-project contract.

## Route Inventory

Use this table while discovering routes.

| Area | Broker route | Method | Local endpoint | Mutates account | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | `/sessions` | POST | Internal only | No | Known | Creates broker session token. |
| Accounts | `/customers/me/accounts` | GET | `GET /v1/broker/holdings` | No | Implemented | Every returned account is retained, including empty accounts. |
| Positions | `/accounts/{account_number}/positions` | GET | `GET /v1/broker/holdings` | No | Implemented | Returns all asset classes; per-account failures are explicit and non-fatal. |
| Watchlists | `/watchlists` | GET | `GET /v1/broker/watchlists`, `POST /v1/broker/research-symbol-context` | No | Implemented | Private membership is available directly and joined per requested symbol. |
| Watchlists | `/watchlists/{watchlist_name}` | PUT | `POST /v1/broker/watchlists/{watchlist_name}/symbols` | Yes | Implemented, gated | Idempotent equity add; fetches and preserves the complete list before replacement. |
| Market data | `/market-data/by-type` | GET | `POST /v1/broker/research-symbol-context` | No | Implemented | Current mark and prior close; partial failures are explicit. |
| Volatility | `/market-metrics` | GET | `POST /v1/broker/research-symbol-context` | No | Implemented | IV index/rank/percentile, broker five-day IV-index change, and liquidity. |
| Orders | `/accounts/{account_number}/orders` | GET | `GET /v1/broker/activity-inbox` | No | Implemented | Resolved prior session or exact requested date; matching metadata enriches normalized transaction groups. |
| Transactions | `/accounts/{account_number}/transactions` | GET | `GET /v1/broker/activity-inbox` | No | Implemented | Resolved prior session or exact requested date; preserves broker transaction/order/group-fill identifiers. |
| Historical earnings | `/market-metrics/historic-corporate-events/earnings-reports/{symbol}` | GET | Planned research context | No | Client implemented | Historical only; does not establish the next earnings date. |

## Sample Notes

Keep redacted examples or links to local sample files here once discovery
starts.

Wave 1 fixtures live under `api/tests/fixtures/tastytrade/`. A safety test
rejects credential-like keys and bearer tokens from the representative fixture
set. Account identifiers use the `FAKE-` prefix.
