import type { DistanceShadow, StrategySummary, PaperSummary } from './generated/research-contracts';

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
  daily: { date: string; complete: boolean; trial_net_scenario: number | null; control_net_scenario: number | null; net_scenario_difference: number | null }[];
}
export interface QuotePilotStatus {
  status: string; date: string; expected_minutes: number; recorded_minutes: number;
  missing_minutes: string[]; sample_states: Record<string, number>;
  valid_observations: number; unavailable_observations: number; repeated_timestamp_observations: number;
  maximum_quote_age_seconds: number | null; maximum_leg_skew_seconds: number | null;
  maximum_response_seconds: number | null; authentication_blocked: boolean;
}
