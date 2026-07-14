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
GET /v1/broker/accounts
GET /v1/broker/summary
GET /v1/broker/positions
GET /v1/broker/orders
GET /v1/broker/trades
GET /v1/broker/quotes?symbols=SPY,QQQ
GET /v1/broker/options/{symbol}/chain
```

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
| Accounts | `/customers/me/accounts` | GET | TBD | No | Known | Lists accounts available to the session. |
| Positions | `/accounts/{account_number}/positions` | GET | TBD | No | Known | Fetches positions for one account. |

## Sample Notes

Keep redacted examples or links to local sample files here once discovery
starts.
