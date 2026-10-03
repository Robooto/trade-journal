// Test-only pipeline catalog fixtures; never production defaults.
import type { PaperCatalog, PaperCohort } from './generated/research-contracts';
const base: PaperCatalog = {
  "schema_version": "paper-catalog.v1",
  "as_of": "2026-09-25",
  "active": {
    "policy_id": "credit-risk-to-close.v4",
    "start_date": "2026-09-22",
    "end_date": null,
    "timing_policy": "regular-close.v2",
    "width_points": 10,
    "stop_debit_multiple": 2.0,
    "minimum_entry_credit_dollars": 50.0,
    "entry_start_local": "07:00",
    "entry_end_local": "12:50"
  },
  "focused_start_date": "2026-09-21",
  "archive_default_policy_id": "baseline-one-position.v1",
  "policies": [
    {
      "id": "baseline-one-position.v1",
      "label": "Legacy baseline \u00b7 structure exit",
      "start_date": null,
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "all-recorded",
      "label": "All recorded opportunities (overlapping)",
      "start_date": null,
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "confirmed-opposition.v1",
      "label": "Confirmed opposition \u00b7 10 minutes",
      "start_date": null,
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "original-structure.v1",
      "label": "Original structure and target",
      "start_date": null,
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "defined-risk-to-close.v1",
      "label": "Defined risk \u00b7 target or close",
      "start_date": "2026-09-14",
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "credit-risk-to-close.v2",
      "label": "Credit risk \u00b7 3\u00d7 debit stop",
      "start_date": "2026-09-21",
      "shadow_of": null,
      "kind": "archive",
      "timing_policy": "regular-close.v2",
      "width_points": null
    },
    {
      "id": "credit-risk-to-close.v3",
      "label": "Credit risk \u00b7 independent overlapping trades",
      "start_date": "2026-09-21",
      "shadow_of": null,
      "kind": "baseline",
      "timing_policy": "regular-close.v2",
      "width_points": 10
    },
    {
      "id": "credit-risk-to-close.v4",
      "label": "Credit risk \u00b7 independent 2\u00d7 debit stop",
      "start_date": "2026-09-22",
      "shadow_of": null,
      "kind": "baseline",
      "timing_policy": "regular-close.v2",
      "width_points": 10
    },
    {
      "id": "first-opposite-take.v1",
      "label": "Paper test \u00b7 exit at first opposite take",
      "start_date": "2026-09-25",
      "shadow_of": "credit-risk-to-close.v4",
      "kind": "shadow",
      "timing_policy": "regular-close.v2",
      "width_points": 10
    },
    {
      "id": "structure-distance-shadow.v1",
      "label": "Paper test \u00b7 exclude fragile structure distance",
      "start_date": "2026-09-28",
      "shadow_of": "credit-risk-to-close.v4",
      "kind": "shadow",
      "timing_policy": "regular-close.v2",
      "width_points": 10
    },
    {
      "id": "paper-distance-one-position.v1",
      "label": "Forward paper trial \u00b7 distance filter and one position",
      "start_date": "2026-10-05",
      "shadow_of": "credit-risk-to-close.v4",
      "kind": "shadow",
      "timing_policy": "regular-close.v2",
      "width_points": 10
    }
  ],
  "distance_shadow": {
    "id": "structure-distance-shadow.v1",
    "label": "Paper test \u00b7 exclude fragile structure distance",
    "start_date": "2026-09-28",
    "shadow_of": "credit-risk-to-close.v4",
    "kind": "shadow",
    "timing_policy": "regular-close.v2",
    "width_points": 10
  },
  "cost_label": "Scenario: $0.65 per contract-side plus $10 round-trip slippage",
  "forward_experiment": {
    "id": "paper-distance-one-position.v1",
    "label": "Forward paper trial \u00b7 distance filter and one position",
    "start_date": "2026-10-05",
    "shadow_of": "credit-risk-to-close.v4",
    "kind": "shadow",
    "timing_policy": "regular-close.v2",
    "width_points": 10
  },
  "quote_pilot": {
    "id": "paper-minute-quotes.v1",
    "start_date": "2026-10-05",
    "end_date": "2026-10-09",
    "interval_seconds": 60,
    "maximum_symbols": 100,
    "maximum_quote_age_seconds": 60,
    "maximum_leg_skew_seconds": 5,
    "maximum_consecutive_failures": 8,
    "exit_evaluation_enabled": false,
    "order_submission_enabled": false
  }
};
const cohorts: Record<string, PaperCohort | null> = {
  "2026-09-18": null,
  "2026-09-21": {
    "policy_id": "credit-risk-to-close.v3",
    "start_date": "2026-09-21",
    "end_date": "2026-09-21",
    "timing_policy": "regular-close.v2",
    "width_points": 10,
    "stop_debit_multiple": 3.0,
    "minimum_entry_credit_dollars": 0.0,
    "entry_start_local": "07:00",
    "entry_end_local": "12:50"
  },
  "2026-09-25": {
    "policy_id": "credit-risk-to-close.v4",
    "start_date": "2026-09-22",
    "end_date": null,
    "timing_policy": "regular-close.v2",
    "width_points": 10,
    "stop_debit_multiple": 2.0,
    "minimum_entry_credit_dollars": 50.0,
    "entry_start_local": "07:00",
    "entry_end_local": "12:50"
  },
  "2026-09-28": {
    "policy_id": "credit-risk-to-close.v4",
    "start_date": "2026-09-22",
    "end_date": null,
    "timing_policy": "regular-close.v2",
    "width_points": 10,
    "stop_debit_multiple": 2.0,
    "minimum_entry_credit_dollars": 50.0,
    "entry_start_local": "07:00",
    "entry_end_local": "12:50"
  }
};
export const catalogForTest = (date: string): PaperCatalog => ({ ...base, as_of: date, active: date in cohorts ? cohorts[date] : date >= '2026-09-22' ? base.active : null });
