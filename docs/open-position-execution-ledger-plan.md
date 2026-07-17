# Open-position execution ledger plan

## Outcome of the live spike

The open-positions payload has no transaction provenance. A read-only two-year,
fully paginated transaction scan was compared with the currently open SPX
contracts:

- 14 active contracts matched 14 opening transactions.
- None of those active fills had `ext-group-fill-id`.
- All 14 had `order-id`.
- Order ID produced four exact opening structures: three four-leg groups and one
  two-leg group.

Therefore, position grouping must use this provenance order:

1. `ext-group-fill-id`, when present.
2. Opening `order-id`, when every active leg maps uniquely.
3. Existing expiration grouping when provenance is missing or ambiguous.

Calendar and diagonal inference remains a conservative fallback only when each
involved expiration contains one leg.

## Proposed normalized model

`OpenExecutionGroupV1`:

- `execution_group_id`: local stable ID derived from account and broker key.
- `account_number`: internal only; UI continues using the account nickname.
- `broker_group_fill_id`: optional.
- `broker_order_id`: optional.
- `underlying_symbol`.
- `opened_at`.
- `legs`: symbol, action, opening quantity, remaining quantity, price, and
  expiration.
- `match_status`: `exact`, `partial`, `ambiguous`, or `unmatched`.
- `provenance_source`: `group_fill`, `order`, or `expiration_fallback`.
- `warnings`.

Position groups should expose the local execution-group ID, match status,
provenance source, and all expiration dates. Raw broker IDs should remain in the
backend contract and diagnostic output, not become primary UI labels.

## Reconciliation algorithm

1. Fetch current positions once per account.
2. Fetch transactions with bounded pagination and cache the result. Start with a
   two-year window and report truncation explicitly.
3. Normalize opening and closing fills using the existing brokerage normalizer.
4. Build opening groups by group-fill ID, otherwise order ID.
5. Match current net contracts to opening groups by account, exact contract
   symbol, direction, and quantity.
6. Mark a group exact only when every displayed leg has a unique provenance
   match and remaining quantities reconcile.
7. For partial closes, reduce quantities only when the closing fill maps to one
   opening group unambiguously. Otherwise mark all candidates ambiguous.
8. Never merge ambiguous groups. Fall back to expiration grouping with a visible
   warning.
9. Cache the ledger separately from quotes so position refreshes do not refetch
   years of transactions.

## Required test fixtures

- Four-leg iron condor with no group-fill ID but one shared order ID.
- Calendar and diagonal with legs in different expirations.
- Multiple spreads sharing one underlying and expiration.
- Partial close of one leg and proportional partial close of all legs.
- Roll containing closing and opening legs.
- Same contract symbol reused by multiple opening orders.
- Missing order ID, truncated pagination, and transaction-source failure.
- Quantity mismatch between transaction replay and current net position.

## Implementation queue

1. Add a bounded paginated transaction-history client/service with cache and
   source metadata.
2. Add `OpenExecutionGroupV1` and reconciliation result schemas.
3. Implement deterministic opening-order grouping and exact current-position
   matching.
4. Add partial-close replay and ambiguity detection.
5. Integrate exact groups into `GET /v1/trades`; retain expiration fallback.
6. Show strategy, leg count, expirations, and an Exact/Partial/Fallback badge in
   Positions.
7. Add API, service, fixture, UI, and live read-only validation tests.
8. Document cache duration, transaction window, diagnostics, and operational
   cost before deployment.

## MVP acceptance criteria

- The current SPX sample renders as three four-leg groups and one two-leg group,
  not two expiration pools.
- No group is presented as exact unless quantities reconcile.
- Existing position totals and account Greeks remain unchanged when groups are
  repartitioned.
- Transaction failures preserve the current Positions page with an explicit
  fallback warning.
