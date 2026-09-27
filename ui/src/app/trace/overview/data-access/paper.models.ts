import type { DistanceShadow, StrategySummary } from './generated/research-contracts';

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
  excluded_baseline_outcome?: { status: string; reason: string; gross_pnl_dollars: number | null };
  path: { ts: string; spot: number | null; quote_status: string; prices: unknown }[];
}
export interface PaperLedgerResponse {
  distance_shadow?: DistanceShadow | null;
  strategy_summaries?: readonly StrategySummary[];
  status: string; total: number; rows: PaperLedgerRow[]; sessions: string[];
  cohorts: { strategy_id: string; policy_id: string; width_points: number; protocol_sha256: string;
    summary: { closed: number; open: number; skipped: number; unevaluable: number; gross_pnl_dollars: number | null } }[];
}
