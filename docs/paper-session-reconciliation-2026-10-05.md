# October 5 paper trades and replay reconciliation

The production pipeline's October 5, 2026 session reconciles without missing or
duplicate trades. The UI compared two populations: replay lists recorded
baseline entries; current session trades use the forward trial's admissions.

| Entry time (Pacific) | Short / long put | Baseline | Forward trial |
| --- | --- | --- | --- |
| 07:10:04 | 7715 / 7705 | Closed, profit target | Closed at 08:00:05, profit target |
| 08:00:05 | 7745 / 7735 | Closed, profit target | Skipped: structure distance below 3 points |
| 09:30:04 | 7745 / 7735 | Closed, profit target | Closed at 10:20:05, profit target |
| 10:50:05 | 7760 / 7750 | Closed, profit target | Skipped: structure distance below 3 points |
| 11:50:05 | 7770 / 7760 | Closed, profit target | Skipped: structure distance below 3 points |

Thus five baseline replay entries correspond to two closed trial trades and
three distance exclusions. A sixth opportunity at 10:20:05 was skipped by both
policies for `entry_credit_below_minimum`; it never became a recorded entry and
is absent from the replay selector. The trial ledger has six unique evaluation
IDs, two closed and four skipped, with no open or unevaluable rows.

Recorded contracts are present in each ledger row's `legs` array. Open cards
previously placed them after the outcome reason; closed cards omitted them.
Both now show a prominent strikes row with the recorded short/long side,
strike, option type and quantity. Missing legs display unavailable strikes.
Replay labels identify the baseline population and explain that it includes
entries excluded by the current trial. No trading or admission rules changed.

## Source receipt and reproducible checks

Read-only production responses from the pipeline at `192.168.50.248:8765`:

- `/api/trace/paper-catalog?as_of=2026-10-05`: active baseline
  `credit-risk-to-close.v4`, forward trial `paper-distance-one-position.v1`.
- `/api/trace/2026-10-05/paper-replay-entries`: five unique directional entries.
- `/api/trace/paper-trades` with `from_date=2026-10-05`,
  `to_date=2026-10-05`, `strategy_id=spx-directional-vertical.v1`,
  `width_points=10`, `active_only=true`, `limit=200`, and each policy above:
  six available rows per policy. Neither result was paginated or unavailable.

To repeat the reconciliation, index trial rows by `onset_ts`, match every
replay entry's `ts`, and compare `status`, `entry_status`, `reason` and `legs`.
Assert unique `evaluation_id` values within each policy and unique
`(strategy_id, capture_id)` keys in replay. Count only `entry_status=recorded`
baseline rows as replay entries; count only `status=closed` trial rows as
closed current-strategy trades. Contract sides and strikes come from `legs`,
not inferred from prices or the frozen structure.
