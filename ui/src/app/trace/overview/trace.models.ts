export type TraceContractStatus = 'ready' | 'partial' | 'missing';
export type TraceSessionRelation =
  | 'historical'
  | 'current_session'
  | 'future'
  | 'invalid_date';

export interface TraceFreshness {
  readonly generated_at: string;
  readonly latest_capture_ts: string | null;
  readonly session_relation: TraceSessionRelation;
  readonly latest_capture_age_seconds: number | null;
}

export interface TraceDataQuality {
  readonly status: TraceContractStatus;
  readonly row_count: number;
  readonly required_fields: readonly string[];
  readonly missing_required_values: Readonly<Record<string, number>>;
  readonly duplicate_capture_ids: number;
  readonly warnings: readonly string[];
}

export interface TraceContractBase<Schema extends string> {
  readonly schema_version: Schema;
  readonly status: TraceContractStatus;
  readonly date: string;
  readonly generated_at: string;
  readonly freshness: TraceFreshness;
  readonly data_quality: TraceDataQuality;
  readonly warnings: readonly string[];
}

export interface TraceSessionDescriptor {
  readonly date: string;
  readonly status: TraceContractStatus;
  readonly capture_count: number;
  readonly unique_capture_count: number;
  readonly start_ts: string | null;
  readonly end_ts: string | null;
  readonly freshness: TraceFreshness;
  readonly data_quality: TraceDataQuality;
  readonly warnings: readonly string[];
}

export interface TraceSessionsResponse {
  readonly schema_version: 'trace-sessions.v1';
  readonly status: TraceContractStatus;
  readonly generated_at: string;
  readonly latest_date: string | null;
  readonly sessions: readonly TraceSessionDescriptor[];
  readonly warnings: readonly string[];
}

export interface TraceSummaryResponse
  extends TraceContractBase<'trace-summary.v1'> {
  readonly rows: number;
  readonly start_ts?: string;
  readonly end_ts?: string;
  readonly spot_open?: number;
  readonly spot_close?: number;
  readonly spot_change?: number;
  readonly min_spot?: TraceValueAtTime | null;
  readonly max_spot?: TraceValueAtTime | null;
  readonly min_spx_hiro?: TraceValueAtTime | null;
  readonly max_spx_hiro?: TraceValueAtTime | null;
  readonly dominant_flow_state?: string;
  readonly flow_state_counts?: Readonly<Record<string, number>>;
}

export interface TraceValueAtTime {
  readonly time: string;
  readonly value: number;
}

export interface TraceDashboardRow {
  readonly date?: string;
  readonly ts: string;
  readonly capture_id: string;
  readonly spot: number | null;
  readonly spx_hiro: number | null;
  readonly spx_hiro_d: number | null;
  readonly spx_hiro_rate_per_minute: number | null;
  readonly spx_hiro_accel_per_minute2: number | null;
  readonly spx_hiro_source_age_seconds: number | null;
  readonly spx_hiro_interval_seconds: number | null;
  readonly spx_hiro_repeated_source: boolean | null;
  readonly equities_hiro: number | null;
  readonly equities_hiro_d: number | null;
  readonly equities_hiro_rate_per_minute: number | null;
  readonly equities_hiro_accel_per_minute2: number | null;
  readonly equities_hiro_source_age_seconds: number | null;
  readonly equities_hiro_interval_seconds: number | null;
  readonly equities_hiro_repeated_source: boolean | null;
  readonly hiro_relationship_class: 'opposing' | 'aligned' | 'flat_or_zero' | 'unavailable';
  readonly hiro_balance_score: number | null;
  readonly hiro_balance_bucket: 'low' | 'medium' | 'high' | null;
  readonly hiro_combined_abs_magnitude: number | null;
  readonly hiro_balance_scoring_effect: 'none';
  readonly flow_state: string | null;
  readonly flow_relationship: string | null;
  readonly flow_acceleration: string | null;
  readonly flow_spx_score: number | null;
  readonly flow_equities_score: number | null;
  readonly flow_spx_impulse: string | null;
  readonly flow_spx_acceleration: string | null;
  readonly flow_equities_impulse: string | null;
  readonly flow_equities_acceleration: string | null;
  readonly flow_readiness_status: string | null;
  readonly flow_history_count: number | null;
  readonly flow_history_span_seconds: number | null;
  readonly flow_is_warm: boolean | null;
  readonly flow_max_source_age_seconds: number | null;
  readonly flow_max_interval_seconds: number | null;
  readonly flow_repeated_source: boolean | null;
  readonly put_wall: number | null;
  readonly hedge_wall: number | null;
  readonly call_wall: number | null;
  readonly global_shelf_center: number | null;
  readonly shelf_center_d: number | null;
  readonly shelf_direction: string | null;
  readonly structure_support_type: string | null;
  readonly structure_support_level: number | null;
  readonly structure_support_distance: number | null;
  readonly structure_support_band: string | null;
  readonly structure_resistance_type: string | null;
  readonly structure_resistance_level: number | null;
  readonly structure_resistance_distance: number | null;
  readonly structure_resistance_band: string | null;
  readonly local_gamma_setup: string | null;
  readonly pocket_sign: string | null;
}

export interface TraceCollectionResponse<Row, Schema extends string>
  extends TraceContractBase<Schema> {
  readonly rows: readonly Row[];
}

export type TraceTimeseriesResponse = TraceCollectionResponse<
  TraceDashboardRow,
  'trace-timeseries.v1'
>;

export interface TraceHistogramRow {
  readonly ts: string;
  readonly capture_id: string;
  readonly timestamp: string;
  readonly gamma_sign: 'positive' | 'negative' | string;
  readonly center_strike: number;
  readonly state: string;
  readonly cluster_share: number | null;
  readonly share_d: number | null;
  readonly center_d_points: number | null;
  readonly cluster_width: number | null;
  readonly spot: number | null;
  readonly put_wall: number | null;
  readonly hedge_wall: number | null;
  readonly call_wall: number | null;
}

export type TraceHistogramResponse = TraceCollectionResponse<
  TraceHistogramRow,
  'trace-histogram-map.v1'
>;

export interface TraceGammaContextRow {
  readonly date: string;
  readonly ts: string;
  readonly capture_id: string;
  readonly pocket_sign: string | null;
  readonly local_gamma_setup: string | null;
  readonly nearest_strike: number | null;
  readonly nearest_total_gamma: number | null;
  readonly cross_spot_slope: number | null;
}

export type TraceGammaContextResponse = TraceCollectionResponse<
  TraceGammaContextRow,
  'trace-gamma-context.v1'
>;

export interface TraceRealizedVolatilityRow {
  readonly date: string;
  readonly ts: string;
  readonly as_of: string;
  readonly capture_id: string;
  readonly realized_vol_bps: number | null;
  readonly return_observations: number;
  readonly lookback_returns: number;
  readonly classification_status: string;
  readonly realized_vol_regime: string | null;
  readonly history_sufficient: boolean;
  readonly current_window_sufficient: boolean;
}

export interface TraceRealizedVolatilityResponse
  extends TraceContractBase<'trace-realized-volatility.v1'> {
  readonly contract_version: 'trace-realized-volatility.v1';
  readonly as_of: string;
  readonly methodology: Readonly<Record<string, unknown>>;
  readonly history: Readonly<Record<string, unknown>>;
  readonly thresholds: Readonly<Record<string, unknown>>;
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly rows: readonly TraceRealizedVolatilityRow[];
}

export interface TraceGammaProfileRow {
  readonly spot: number;
  readonly gamma: number;
}

export interface TraceGammaProfileResponse
  extends TraceContractBase<'trace-gamma-profile.v1'> {
  readonly ts: string;
  readonly capture_id: string;
  readonly spot: number;
  readonly window_points: number;
  readonly cross_spot_slope: number | null;
  readonly source: {
    readonly mode: string;
    readonly timestamp: string | null;
    readonly time: string | null;
  };
  readonly rows: readonly TraceGammaProfileRow[];
}

export type TraceSnapshotResponse = TraceContractBase<'trace-snapshot.v1'> &
  TraceDashboardRow & {
    readonly histogram_nodes: readonly Omit<
      TraceHistogramRow,
      'ts' | 'capture_id' | 'timestamp' | 'spot' | 'put_wall' | 'hedge_wall' | 'call_wall'
    >[];
  };

export interface TraceIntradayContextResponse
  extends Omit<TraceContractBase<'trace-intraday-context.v1'>, 'data_quality'> {
  readonly as_of: string;
  readonly capture_id: string;
  readonly observations: Readonly<Record<string, unknown>>;
  readonly interpretation: Readonly<Record<string, unknown>>;
  readonly data_quality: Readonly<Record<string, unknown>> & {
    readonly status?: string;
    readonly warnings?: readonly string[];
  };
}

export interface TraceSessionBundle {
  readonly date: string;
  readonly summary: TraceSummaryResponse | null;
  readonly timeseries: TraceTimeseriesResponse | null;
  readonly histogram: TraceHistogramResponse | null;
  readonly gammaContext: TraceGammaContextResponse | null;
  readonly realizedVolatility: TraceRealizedVolatilityResponse | null;
  readonly errors: TraceSessionSourceErrors;
}

export interface TraceSessionSourceErrors {
  readonly summary?: string;
  readonly timeseries?: string;
  readonly histogram?: string;
  readonly gammaContext?: string;
  readonly realizedVolatility?: string;
}

export interface TraceResourceStatus {
  readonly key: keyof Omit<TraceSessionBundle, 'date' | 'errors'>;
  readonly label: string;
  readonly status: TraceContractStatus | 'unavailable';
  readonly warningCount: number;
}
export type TraceStudyDisposition =
  | 'production'
  | 'presentation_only'
  | 'research'
  | 'preregistered'
  | 'collecting'
  | 'ready_for_review'
  | 'demoted'
  | 'gate_ready'
  | 'not_replicated'
  | 'replicated'
  | 'paused';

export interface TraceStudyCheckpoint {
  readonly completed_sessions: number;
  readonly required_sessions: number;
  readonly start_date: string | null;
  readonly remaining_sessions?: number;
  readonly definition_frozen?: boolean;
  readonly evidence_version?: string;
  readonly protocol?: string;
}

export interface TraceStudyStatus {
  readonly id: string;
  readonly label: string;
  readonly status: TraceStudyDisposition;
  readonly scoring_enabled: boolean;
  readonly note?: string;
  readonly checkpoint?: TraceStudyCheckpoint;
  readonly data_readiness?: 'ready' | 'collecting' | 'unavailable';
  readonly validation_status?: string;
  readonly evidence_tables?: readonly {
    readonly title: string;
    readonly scope: string;
    readonly week_end: string;
    readonly source: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
  }[];
  readonly weekly_coverage?: {
    readonly source: string;
    readonly requested_range: readonly string[];
    readonly eligible_dates: readonly string[] | null;
    readonly observed_dates?: readonly string[] | null;
    readonly excluded_dates: readonly { readonly trading_date: string; readonly reason: string | null }[] | null;
    readonly latest_trading_date: string | null;
    readonly latest_report_date?: string | null;
    readonly last_received_at: string | null;
    readonly last_observation_at?: string | null;
    readonly denominator?: { readonly name: string; readonly value: number } | null;
    readonly reason?: string;
  };
}

export interface TraceResearchStatusResponse {
  readonly schema_version: 'trace-study-registry.v1';
  readonly as_of: string;
  readonly evidence_version: string;
  readonly study_count: number;
  readonly scoring_enabled_count: number;
  readonly latest_weekly_review?: {
    readonly week_start: string;
    readonly week_end: string;
    readonly run_status: string;
  } | null;
  readonly studies: readonly TraceStudyStatus[];
}

export interface TracePaperScorecardDaily {
  readonly date: string;
  readonly closed: number;
  readonly open: number;
  readonly unevaluable: number;
  readonly skipped: number;
  readonly gross_pnl_dollars: number | null;
  readonly no_entry?: boolean;
}

export interface TracePaperScorecardCohort {
  readonly policy_id: string;
  readonly policy_label: string;
  readonly study_mode: string;
  readonly timing_policy: string;
  readonly protocol_sha256: string;
  readonly summary: {
    readonly take_episodes: number;
    readonly closed: number;
    readonly open: number;
    readonly unevaluable: number;
    readonly skipped: number;
    readonly wins: number;
    readonly losses: number;
    readonly gross_win_rate: number | null;
    readonly gross_pnl_dollars: number | null;
    readonly gross_expectancy_dollars: number | null;
    readonly worst_session_gross_pnl_dollars: number | null;
    readonly realized_closed_drawdown_dollars: number | null;
    readonly entry_coverage: number | null;
    readonly entry_coverage_denominator: number;
    readonly daily: readonly TracePaperScorecardDaily[];
  };
}

export interface TracePaperScorecardResponse {
  readonly schema_version: 'spx-paper-scorecard.v1';
  readonly from_date: string;
  readonly to_date: string;
  readonly status: TraceContractStatus | 'no_evidence' | 'unavailable';
  readonly session_count: number;
  readonly source_status_counts: Readonly<Record<string, number>>;
  readonly cohorts: readonly TracePaperScorecardCohort[];
  readonly warnings: readonly string[];
}

export interface TracePaperReplayResponse {
  readonly schema_version: 'spx-paper-replay.v1';
  readonly date: string;
  readonly as_of: string;
  readonly selected_capture_id: string;
  readonly entry_capture_id: string;
  readonly trade: {
    readonly capture_id: string;
    readonly onset_ts: string;
    readonly status: string;
    readonly reason: string;
    readonly trade_type: string;
    readonly strategy_id?: string;
    readonly timing_policy: string;
    readonly frozen_structure: { readonly type?: string; readonly level?: number } | null;
    readonly structures?: Readonly<Record<string, { readonly type?: string; readonly level?: number; readonly distance?: number }>>;
    readonly legs?: readonly { readonly side: string; readonly option_type: string; readonly strike: number; readonly symbol: string; readonly expiration: string; readonly quantity: number }[];
    readonly short_strike: number | null;
    readonly long_strike: number | null;
    readonly entry_credit_dollars: number | null;
    readonly exit_debit_dollars: number | null;
    readonly gross_pnl_dollars: number | null;
  };
  readonly path: readonly { readonly ts: string; readonly capture_id: string; readonly spot: number | null; readonly gap_seconds: number | null; readonly gap: boolean; readonly entry?: boolean; readonly exit?: boolean }[];
  readonly levels: readonly { readonly label: string; readonly price: number | null }[];
  readonly hierarchy_events: readonly { readonly ts: string; readonly capture_id: string; readonly event: string }[];
  readonly gaps_explicit: boolean;
  readonly warnings: readonly string[];
}

export interface TracePaperReplayEntriesResponse {
  readonly schema_version: 'spx-paper-replay-entries.v1';
  readonly date: string;
  readonly status: 'available' | 'no_evidence' | 'unavailable';
  readonly entries: readonly {
    readonly capture_id: string;
    readonly ts: string;
    readonly trade_type: string | null;
    readonly strategy_id?: string;
    readonly protocol_sha256: string | null;
  }[];
}
