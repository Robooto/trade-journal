# tastytrade Route Use Map

This document summarizes tastytrade API routes that are useful for the trading
workspace and how `trade-journal` can expose them safely to the rest of the
system.

Source docs reviewed:

- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/llms.txt`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/api-overview.md`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/oauth2.md`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/open-api-spec/`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/order-management.md`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/streaming-account-data.md`
- `/home/boots/code/trading/docs/tastytrade-llms-txt-docs/docs/streaming-market-data.md`

## API Conventions To Build Around

- Production base URL: `https://api.tastyworks.com`.
- Sandbox base URL: `https://api.cert.tastyworks.com`.
- Requests require a `User-Agent` header in `<product>/<version>` format.
- Auth uses OAuth2 bearer tokens in the `Authorization` header.
- OAuth access tokens expire quickly, so `trade-journal` should own refresh and
  token caching.
- Request and response body keys are dasherized in most REST APIs.
- Standard responses are wrapped in `data`; collection responses usually use
  `data.items`.
- Some market-data responses use camelCase fields.
- GET array parameters are passed as repeated keys such as
  `status[]=Live&status[]=Filled`.

## Recommended Local Boundary

`trade-journal` should expose a read-first local API. Other projects should not
call tastytrade directly.

Suggested local route groups:

```text
GET  /v1/broker/accounts
GET  /v1/broker/account-summary
GET  /v1/broker/trading-status
GET  /v1/broker/positions
GET  /v1/broker/orders
GET  /v1/broker/transactions
GET  /v1/broker/quotes
GET  /v1/broker/option-chains/{symbol}
POST /v1/broker/orders/dry-run
POST /v1/broker/margin/dry-run
```

Do not expose live order submission to `market-data-pipeline` or
`openclaw-assistant` until explicit policy gates, audit logs, and live-mode
switches exist.

## Route Priorities

### 1. Authentication

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/oauth/token` | POST | Exchange a refresh token for a short-lived access token. | Internal only. `trade-journal` already uses this in `app/tastytrade.py`. |

Implementation notes:

- Store `client_secret` and `refresh_token` outside git.
- Cache access tokens and refresh before expiry.
- Keep all broker credentials inside `trade-journal`.

### 2. Account Discovery And Permissions

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/customers/me/accounts` | GET | Discover account numbers available to the authenticated user. | Build `/v1/broker/accounts`. |
| `/customers/me/accounts/{account_number}` | GET | Fetch one account's details. | Optional detail route for account metadata. |
| `/accounts/{account_number}/trading-status` | GET | Read permissions, account restrictions, portfolio margin flags, PDT state, options/futures/crypto permissions, closing-only/frozen flags. | Include in account summary and pre-trade risk checks. |

Why it matters:

- OpenClaw can know whether the account is restricted before suggesting action.
- The pipeline can reject candidates if the account is closing-only, frozen, in a
  margin call, or lacks the needed permissions.

### 3. Balances, Buying Power, And Position Context

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/accounts/{account_number}/balances` | GET | Current balance, net liquidation value, buying power, margin values, cash, long/short values. | Build `/v1/broker/account-summary`. |
| `/accounts/{account_number}/positions` | GET | Current positions. Supports useful flags such as `net-positions=true` and `include-marks=true`. | Build `/v1/broker/positions` and OpenClaw portfolio packets. |
| `/accounts/{account_number}/balance-snapshots` | GET | Historical balance snapshots. | Later: equity curve and performance history. |
| `/accounts/{accountNumber}/net-liq/history` | GET | Net liquidation history candles. | Later: account analytics, drawdown charts, and daily review. |

Immediate uses:

- Buying-power utilization checks.
- Duplicate exposure checks.
- Symbol concentration checks.
- Portfolio theta/delta/vega review if marks and greeks are available through
  current position or market-data joins.
- Daily OpenClaw portfolio discipline reports.

### 4. Orders And Fills

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/accounts/{account_number}/orders` | GET | Search historical orders by date, status, underlying, futures symbol, instrument type, pagination. | Build `/v1/broker/orders`. |
| `/accounts/{account_number}/orders/live` | GET | Fetch orders created or updated today, including live, filled, canceled, rejected, and GTC orders touched today. | Manual dashboard refresh only; do not poll for real-time updates. |
| `/accounts/{account_number}/orders/{id}` | GET | Fetch one order with leg/fill detail. | Drilldown for journal and audit trail. |
| `/accounts/{account_number}/orders/dry-run` | POST | Validate an order without placing it; returns warnings, buying-power effect, and fees. | Pre-trade validator for staged ideas. |
| `/accounts/{account_number}/orders` | POST | Submit a live order. | Future only; keep behind explicit live policy gates. |
| `/accounts/{account_number}/orders/{id}` | DELETE | Cancel a live order. | Future manual-control workflow only. |
| `/accounts/{account_number}/orders/{id}` | PUT/PATCH | Replace/edit order details where supported. | Future manual-control workflow only. |
| `/accounts/{account_number}/complex-orders` | POST | Submit OTO/OCO/OTOCO/BLAST/PAIRS style complex orders. | Future only; existing client has a complex-order submit helper. |
| `/accounts/{account_number}/complex-orders/{id}` | GET/DELETE | Fetch or cancel complex orders. | Future manual-control workflow only. |

Immediate uses:

- Read historical orders for journal reconciliation.
- Use dry-run to validate candidate structures without placing orders.
- Estimate fees and buying-power effect before a trade idea becomes a staged
  ticket.

Safety notes:

- tastytrade explicitly warns not to poll `/orders/live` for real-time updates.
  Use the account streamer for live order state.
- Order submission should remain out of scope for `market-data-pipeline`.
- If staged tickets are added later, require a manual review workflow and a
  separate live-mode flag.

### 5. Transactions And Fees

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/accounts/{account_number}/transactions` | GET | Account ledger with filters for symbol, underlying, futures symbol, type, subtype, and date range. | Build trade history, fills, assignments, expirations, and journal reconciliation. |
| `/accounts/{account_number}/transactions/{id}` | GET | Fetch one transaction. | Drilldown and audit detail. |
| `/accounts/{account_number}/transactions/total-fees` | GET | Fee summary for a date. | Daily/weekly fee review. |

Immediate uses:

- Import closed trades and fills into journal reports.
- Track assignments, expirations, commissions, regulatory fees, and realized
  trade costs.
- Compare model/staged ideas against actual fills.

### 6. Market Data Snapshots

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/market-data/by-type` | GET | One-time quote snapshots for up to 100 combined symbols across equities, options, futures, futures options, crypto, and indexes. | Build `/v1/broker/quotes`; feed liquidity and mark checks. |
| `/market-metrics?symbols={symbols}` | GET | IV index, IV rank, IV percentile, liquidity metrics, and per-expiration IV data. | Use for strategy fit, IV regime, and OpenClaw portfolio review. |

Immediate uses:

- Check bid/ask spread width before accepting an option idea.
- Pull underlying marks for SpotGamma/FlowPatrol symbols.
- Add IV rank and IV change to OpenClaw reviews.
- Reject illiquid names or chains before human attention is spent on them.

Notes:

- Sandbox does not support all market-metrics behavior.
- `market-data/by-type` uses singular parameters like `equity-option`, not
  `equity-options`.

### 7. Instruments And Option Chains

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/symbols/search/{symbol}` | GET | Prefix search and symbol validation. | Symbol lookup/autocomplete and input validation. |
| `/instruments/equities/{symbol}` | GET | Equity details, active status, lendability, fractional eligibility, streamer symbol. | Validate equities and get streamer symbols. |
| `/instruments/equities/active` | GET | Paginated active equities. | Later symbol universe maintenance. |
| `/instruments/equity-options/{symbol}` | GET | Resolve one OCC option contract. | Decode position/order option symbols. |
| `/option-chains/{symbol}` | GET | Full equity option chain. | Complete contract metadata when needed. |
| `/option-chains/{symbol}/compact` | GET | Compact equity option chain. | Efficient chain discovery. |
| `/option-chains/{symbol}/nested` | GET | Option chain grouped by expiration and strike. | Best first choice for dashboard and candidate selection. |
| `/instruments/futures` | GET | Futures contract definitions by symbol/product/exchange/security id. | Futures context for `/ES`, `/NQ`, etc. |
| `/instruments/future-products` | GET | Futures product catalog. | Product discovery. |
| `/futures-option-chains/{product-code}/nested` | GET | Futures option chain grouped by expiration/strike. | Later futures-options workflow. |
| `/instruments/cryptocurrencies` | GET | Crypto instruments. | Optional market context. |
| `/instruments/quantity-decimal-precisions` | GET | Quantity precision rules. | Validate fractional/crypto order sizing if ever needed. |

Immediate uses:

- Convert FlowPatrol or OpenClaw symbols into real tradeable instruments.
- Pull option symbols and streamer symbols for candidate chains.
- Select expirations/strikes for debit spreads, credit spreads, calendars, and
  other candidate structures.

### 8. Margin And Risk

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/margin/accounts/{account_number}/requirements` | GET | Current margin/capital requirements report. | Account risk dashboard and OpenClaw context. |
| `/margin/accounts/{account_number}/dry-run` | POST | Estimate margin impact of a prospective order without placing it. | Deterministic validation for staged ideas. |
| Risk parameter endpoints | GET | Position limits, per-symbol margin requirements, risk-free rates, raw SPAN data. | Later futures/options risk model improvements. |

Immediate uses:

- Compare a proposed structure against available buying power.
- Reject ideas that increase margin beyond the trading plan.
- Track portfolio-margin-specific risk signals.

### 9. Market Sessions

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/market-time/sessions/current` | GET | Current session across multiple collections. | Shared market-open/closed gate. |
| `/market-time/equities/sessions/current` | GET | Current equity/equity-options session. | Equity/options order and alert timing. |
| `/market-time/equities/sessions/next` | GET | Next equity session. | Scheduler and daily packet timing. |
| `/market-time/sessions` | GET | Session range and holidays. | Backfill schedules, holiday-aware jobs. |

Immediate uses:

- Prevent stale or out-of-session alerts.
- Label premarket, regular-hours, and after-hours context correctly.
- Avoid order dry-runs or staged tickets outside intended sessions unless
  explicitly allowed.

### 10. Streaming

| tastytrade route or host | Use | Local use |
| --- | --- | --- |
| `/api-quote-tokens` | Fetch DXLink token and websocket URL for quote streaming. | Later quote streamer managed by `trade-journal` or a broker data worker. |
| `wss://streamer.tastyworks.com` | Account streamer for order, balance, and position updates. | Later account-state cache without polling. |
| DXLink websocket URL from `/api-quote-tokens` | Market data streamer for quote, trade, summary, profile, greeks, time-and-sale, candle events. | Later live quote/greeks feed for active watchlist. |

Immediate posture:

- Prefer REST snapshots first.
- Add streaming later when polling becomes a real limitation.
- Use account streamer instead of polling `/orders/live` for real-time order
  status.

### 11. Watchlists And Quote Alerts

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/watchlists` and `/watchlists/{watchlist_name}` | GET/POST/PUT/DELETE | User watchlist CRUD. | Optional sync with broker watchlists. |
| `/public-watchlists` | GET | Read tastytrade public watchlists. | Optional idea/source discovery. |
| `/pairs-watchlists` | GET | Read pairs watchlists. | Optional pairs-trade research. |
| `/quote-alerts` routes | CRUD | User-level price/IV quote alerts. | Later bridge to personal alert workflow if useful. |

These are lower priority than account, position, chain, market-data, and dry-run
routes.

### 12. Backtesting

| tastytrade route | Method | Use | Local use |
| --- | --- | --- | --- |
| `/available-dates` | GET | Discover supported backtest dates. | Later research. |
| `/backtests` | POST | Create historical options strategy backtest. | Later compare generated ideas with broker-side simulation. |
| `/backtests/{id}` | GET | Fetch backtest result. | Later research. |
| `/simulate-trade` | POST | Historical pricing simulation. | Later validation. |

This is useful but not part of the near-term execution path. The first research
priority should remain local shadow outcomes from captured data.

## Suggested Build Order

1. Harden existing OAuth token handling and headers.
2. Build a normalized account summary from accounts, trading status, balances,
   positions, and market data.
3. Add orders and transactions read APIs for journal reconciliation.
4. Add symbol search and nested option-chain lookup.
5. Add order dry-run and margin dry-run for candidate validation.
6. Add market sessions to gate alerts and candidate workflows.
7. Add streaming only after REST snapshots are insufficient.
8. Consider staged tickets and live order routes only after shadow results and
   policy gates are proven.

## Near-Term Local Data Products

`trade-journal` can expose these stable products to `market-data-pipeline` and
`openclaw-assistant`:

- `broker_accounts`: available accounts and account labels.
- `broker_account_summary`: net liq, buying power, cash, margin state, account
  restrictions, PDT/day-trade state.
- `broker_positions`: normalized positions with marks and underlying symbols.
- `broker_orders`: searchable order history and current-day order status.
- `broker_transactions`: fills, fees, assignments, expirations, dividends, and
  cash events.
- `broker_quotes`: quote snapshots by symbol and instrument type.
- `broker_option_chains`: chain metadata, symbols, expirations, strikes, and
  streamer symbols.
- `broker_pretrade_checks`: dry-run result, margin impact, liquidity checks,
  duplicate exposure checks, and policy rejection reasons.

## Routes Already Represented In The Client

The existing `trade-journal/api/app/tastytrade.py` client already covers:

- `POST /oauth/token`
- `GET /customers/me/accounts`
- `GET /accounts/{account_number}/positions?net-positions=true&include-marks=true`
- `GET /accounts/{account_number}/balances`
- `GET /market-data/by-type`
- `GET /market-metrics`
- `POST /accounts/{account_number}/complex-orders`

The next best additions are:

- `GET /accounts/{account_number}/trading-status`
- `GET /accounts/{account_number}/orders`
- `GET /accounts/{account_number}/orders/{id}`
- `POST /accounts/{account_number}/orders/dry-run`
- `GET /accounts/{account_number}/transactions`
- `GET /accounts/{account_number}/transactions/total-fees`
- `GET /symbols/search/{symbol}`
- `GET /option-chains/{symbol}/nested`
- `GET /margin/accounts/{account_number}/requirements`
- `POST /margin/accounts/{account_number}/dry-run`
- `GET /market-time/equities/sessions/current`
