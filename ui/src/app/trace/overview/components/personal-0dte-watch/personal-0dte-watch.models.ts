export type Personal0DteWatchState = 'candidate' | 'watch' | 'inactive';

export interface Personal0DteWatchSetup {
  readonly direction: 'bull_put' | 'bear_call';
  readonly strategy: string;
  readonly hiro_state: string;
  readonly structure_type: string | null;
  readonly structure_level: number;
  readonly structure_distance: number;
  readonly invalidation_distance_points: number;
  readonly invalidation_band: string;
  readonly short_strike_zone: readonly number[];
  readonly short_strike_requirement: {
    readonly side: 'below' | 'above';
    readonly invalidation_level: number;
    readonly studied_buffer_min_points: number;
    readonly studied_buffer_max_points: number;
    readonly status: 'unverified_live_chain';
  };
  readonly spread_width_points: number;
}

export interface Personal0DteWatchResponse {
  readonly schema_version: 'trace-personal-0dte-watch.v1';
  readonly status: 'ready' | 'partial';
  readonly as_of: string | null;
  readonly capture_id: string | null;
  readonly state: Personal0DteWatchState;
  readonly label: string;
  readonly setup: Personal0DteWatchSetup | null;
  readonly observations: {
    readonly spot: number | null;
    readonly gamma_regime: string;
    readonly local_gamma_setup: string | null;
    readonly in_research_window: boolean;
  };
  readonly rules: {
    readonly expiration: string;
    readonly spread_width_points: number;
    readonly max_short_strike_distance_points: number;
    readonly research_window: string;
    readonly candidate_requires_positive_gamma: boolean;
    readonly option_quote_required: boolean;
  };
  readonly reason: string;
  readonly execution_journal: {
    readonly status: 'not_linked' | 'linked';
    readonly trace_candidate_overlap: boolean;
    readonly entry_lag_minutes: number | null;
    readonly trace_path_mfe_points: number | null;
    readonly trace_path_mae_points: number | null;
    readonly executed_credit: number | null;
    readonly fees: number | null;
    readonly slippage: number | null;
    readonly quote_timestamp: string | null;
    readonly note: string;
  };
  readonly warnings: readonly string[];
}
