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
  readonly flow_state: string | null;
  readonly flow_relationship: string | null;
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
  readonly as_of: string;
  readonly capture_id: string;
  readonly realized_vol_bps: number | null;
  readonly return_observations: number;
  readonly classification_status: string;
  readonly realized_vol_regime: string | null;
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