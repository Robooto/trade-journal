# Trade Journal Product Roadmap

Last reviewed: 2026-07-14

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

Next:

- Add structured thesis/plan/management/outcome fields without making quick
  notes cumbersome.
- Link entries to positions, orders, fills, and originating research ideas.
- Add weekly summaries and rule-adherence review.

### Position list and rule supervision

Show every option position, how it is performing, and whether it follows the
trading plan.

Current:

- Positions grouped by account, underlying, and expiration.
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

### Brokerage boundary and LLM packs

Keep Tastytrade authentication and normalization here, then serve stable,
read-first contracts to the UI, OpenClaw, and market-data research.

Current:

- Accounts, balances, positions, quotes, volatility metrics, and complex-order
  client support.
- LLM-friendly position, market-data, volatility, and equity-analysis packages.
- Normalized account risk fields and explicit brokerage balance freshness/missing-data metadata in both the positions API and LLM positions pack.
- Historical price/chart features and portable JSON/Markdown handoffs.

Next:

1. Add a broader trading-status model beyond the implemented account risk summary.
2. Orders, order detail, transactions/fills, fees, assignments, and expirations.
3. Nested option chains, margin requirements, order dry-run, and margin dry-run.
4. Portfolio-review and trade-review packs with freshness and missing-data
   status.
5. Document all stable cross-project contracts.

### Trade visualization

Use charts to connect market movement with the actual trade lifecycle.

Current: underlying history, chart features, manual SpotGamma context, and
position chart expansion.

Next:

- Plot entries, fills, adjustments, exits, and current option positions.
- Show thesis/invalidation levels and important journal notes.
- Allow a chart/date range to be exported with a consistent LLM data pack.
- Keep option marks and P/L clearly distinguished from underlying price.

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
