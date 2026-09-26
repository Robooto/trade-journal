export type DecisionStatus = 'ready' | 'unavailable' | 'ineligible';
export type Spx0DteDecision = 'take' | 'pass';
export type Spx0DteTradeType = 'bull_put_credit' | 'bear_call_credit';

export interface Spx0DteDecisionJournalResponse {
  readonly schema_version: 'spx-0dte-decision.v1';
  readonly protocol_id: 'spx-0dte-decision-journal-v1';
  readonly date: string;
  readonly ts: string | null;
  readonly capture_id: string | null;
  readonly prior_capture_id: string | null;
  readonly decision_status: DecisionStatus;
  readonly decision: Spx0DteDecision;
  readonly trade_type: Spx0DteTradeType | null;
  readonly quality_score: number;
  readonly grade: 'A' | 'B' | 'C' | 'D';
  readonly score_components: Readonly<Record<string, number>>;
  readonly hard_gates: Readonly<Record<string, boolean>>;
  readonly reason_codes: readonly string[];
  readonly frozen_structure: {
    readonly type: string;
    readonly level: number;
    readonly distance_points_at_freeze: number;
    readonly distance_band: string;
  } | null;
  readonly execution_ready: false;
  readonly paper_trade_status: 'not_open' | 'awaiting_option_quote';
  readonly paper_trade: {
    readonly spread_width_points: number;
    readonly profit_target_fraction_of_initial_credit: number;
    readonly forced_exit_time: string;
  };
  readonly selection: 'exact' | 'latest';
  readonly protocol: {
    readonly id: 'spx-0dte-decision-journal-v1';
    readonly status: 'preregistered';
    readonly frozen_on: string;
    readonly prospective_start_date: string;
  };
  readonly study: {
    readonly id: 'spx-0dte-decision-journal';
    readonly status: string;
    readonly mode: 'prospective_decision_journal';
    readonly order_submission_enabled: false;
    readonly ai_decisioning: false;
  };
  readonly warnings: readonly string[];
  readonly paper_evidence?: PaperEvidence;
}

export interface PaperWidthComparison {
  readonly schema_version: 'spx-paper-widths.v1';
  readonly status: 'available' | 'no_evidence' | 'unavailable';
  readonly prospective_start_date: string;
  readonly paired_entry_count: number;
  readonly expected_entry_count: number;
  readonly widths: readonly {
    readonly width_points: number;
    readonly recorded_entries: number;
    readonly mean_entry_credit_dollars: number | null;
    readonly policies: readonly {
      readonly id: string;
      readonly label: string;
      readonly summary: {
        readonly closed_episodes: number;
        readonly open_episodes: number;
        readonly unevaluable_episodes: number;
        readonly skipped_episodes: number;
        readonly gross_pnl_dollars: number | null;
        readonly gross_expectancy_dollars: number | null;
        readonly mean_return_on_max_risk: number | null;
        readonly realized_drawdown_dollars: number | null;
      };
    }[];
  }[];
}

export interface PaperEvidence {
  readonly width_comparison?: PaperWidthComparison;
  readonly management_comparison?: {
    readonly schema_version: 'spx-paper-management.v1';
    readonly prospective_start_date: string;
    readonly mode: 'prospective' | 'retrospective';
    readonly position_rule: string;
    readonly exit_rule: string;
    readonly policies: readonly {
      readonly id: string;
      readonly label: string;
      readonly summary: {
        readonly closed_episodes: number;
        readonly open_episodes: number;
        readonly unevaluable_episodes: number;
        readonly skipped_episodes: number;
        readonly gross_pnl_dollars: number | null;
        readonly gross_win_rate: number | null;
      };
      readonly episodes: readonly {
        readonly capture_id: string;
        readonly onset_ts: string;
        readonly status: string;
        readonly reason: string;
        readonly gross_pnl_dollars: number | null;
        readonly distance_filter?: string;
        readonly excluded_baseline_outcome?: { readonly status: string; readonly reason: string; readonly gross_pnl_dollars: number | null };
      }[];
    }[];
  };
  readonly schema_version: 'spx-paper-outcomes.v1';
  readonly date: string;
  readonly as_of: string;
  readonly status: 'available' | 'no_evidence' | 'unavailable';
  readonly costs_status: 'untracked';
  readonly net_win_rate: null;
  readonly preferred_credit_dollars: number;
  readonly summary: {
    readonly take_episodes: number;
    readonly recorded_entries: number;
    readonly closed_episodes: number;
    readonly open_episodes: number;
    readonly unevaluable_episodes: number;
    readonly gross_win_rate: number | null;
    readonly gross_pnl_dollars: number | null;
    readonly gross_expectancy_dollars: number | null;
  } | null;
  readonly episodes: readonly {
    readonly capture_id: string;
    readonly onset_ts: string;
    readonly trade_type: string;
    readonly status: string;
    readonly reason: string;
    readonly exit_signals?: readonly string[];
    readonly entry_credit_dollars: number | null;
    readonly credit_difference_dollars: number | null;
    readonly exit_debit_dollars: number | null;
    readonly gross_pnl_dollars: number | null;
  }[];
}

export interface Spx0DteHumanDecision {
  readonly schema_version: 'spx-0dte-human-decision.v1';
  readonly id: number;
  readonly session_date: string;
  readonly trace_ts: string;
  readonly capture_id: string;
  readonly decision: Spx0DteDecision;
  readonly trade_type: Spx0DteTradeType | null;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface Spx0DteHumanDecisionList {
  readonly schema_version: 'spx-0dte-human-decision-list.v1';
  readonly rows: readonly Spx0DteHumanDecision[];
}

export interface Spx0DteHumanDecisionCreate {
  readonly session_date: string;
  readonly trace_ts: string;
  readonly capture_id: string;
  readonly decision: Spx0DteDecision;
  readonly trade_type: Spx0DteTradeType | null;
  readonly notes: string | null;
}
