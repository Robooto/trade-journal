import type { DistanceShadow, StrategySummary, PaperSummary, PaperSessionCoverage } from './generated/research-contracts';

export interface PaperLeg {
  symbol: string; side: string; option_type: string; strike: number; expiration: string; quantity: number;
  entry_quote: { bid: number; ask: number; quoted_at: string } | null;
  exit_quote: { bid: number; ask: number; quoted_at: string } | null;
}
export interface PaperLedgerRow {
  evaluation_id: string; strategy_id: string; date: string; onset_ts: string; trade_type: string;
  status: string; reason: string; entry_status: string; width_points: number; legs: PaperLeg[];
  protocol_sha256: string; timing_policy: string; entry_credit_dollars: number | null;
  exit_debit_dollars: number | null; gross_pnl_dollars: number | null; max_risk_dollars: number | null;
  exit_ts: string | null; frozen_structure: unknown; structures: unknown;
  cost_scenarios?: { label: string; net_scenario_dollars: number }[];
  distance_filter?: string;
  excluded_control_outcome?: { status: string; reason: string; gross_pnl_dollars: number | null };
  excluded_baseline_outcome?: { status: string; reason: string; gross_pnl_dollars: number | null };
  path: { ts: string; spot: number | null; quote_status: string; prices: unknown }[];
}
export interface PaperLedgerResponse {
  session_coverage?: readonly PaperSessionCoverage[];
  forward_experiment?: ForwardExperiment | null;
  distance_shadow?: DistanceShadow | null;
  strategy_summaries?: readonly StrategySummary[];
  status: string; total: number; rows: PaperLedgerRow[]; sessions: string[];
  cohorts: { strategy_id: string; policy_id: string; width_points: number; protocol_sha256: string;
    summary: { closed: number; open: number; skipped: number; unevaluable: number; gross_pnl_dollars: number | null } }[];
}

export interface ForwardExperiment {
  start_date: string; control_policy_id: string;
  required_sessions: number; required_trial_closes: number;
  complete_eligible_sessions: number; eligible_trial_closes: number; checkpoint_status: string;
  trial: PaperSummary; control: PaperSummary; skip_reasons: Record<string, number>;
  missing_distance_retained: number;
  mean_session_net_scenario: number | null; mean_session_net_interval_95: number[] | null;
  mean_session_difference: number | null;
  daily: { date: string; complete: boolean; collection?: PaperSessionCoverage; trial_net_scenario: number | null; control_net_scenario: number | null; net_scenario_difference: number | null }[];
}

/** Live baseline rules next to frozen arms (hold family, or strategy spec v1), scored by the pipeline backtester. */
export interface BacktestPolicySummary {
  admitted: number; closed: number; censored: number; net_dollars: number | null; net_per_trade: number | null;
  win_rate: number | null; break_even_win_rate: number | null; worst_session: number | null;
  session_totals: Record<string, number>; exit_reasons: Record<string, number>;
}
export interface BacktestScorecardPolicy {
  id: string; label: string; summary: BacktestPolicySummary;
  versus_reference: { sessions: number; difference_dollars: number } | null;
  /** The policy versus_reference is paired against: the reference, or the arm's own control (spec). */
  compared_to?: string | null;
  trades: { day: string; onset?: string; status: string; reason?: string | null; gross?: number | null; net: number | null;
    quality_score?: number | null }[];
}
export interface PaperBacktestScorecard {
  schema_version: 'paper-backtest-scorecard.v1'; from_date: string; to_date: string | null; sessions: string[];
  reference_policy: string; cost_per_trade_dollars: number | null; cost_if_settled_dollars?: number | null; policies: BacktestScorecardPolicy[];
  order_submission_enabled: false;
}
