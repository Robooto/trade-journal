export interface CharmDatesResponse { dates: string[]; }

export interface CharmSeriesPoint {
  ts: string;
  capture_id: string;
  spot: number;
  surface_spot: number;
  charm_at_market: number;
  nearest_flip: number | null;
  spot_minus_flip: number | null;
  snapshot_ts: string;
  model_ts: string;
  next_model_ts: string;
  interval_minutes: number;
  source_age_seconds: number;
  close_window: boolean;
}

export interface CharmOverview {
  schema_version: 'trace-charm-overview.v1';
  date: string;
  status: 'experimental';
  interpretation: {
    scoring_enabled: false;
    directional_labels_enabled: false;
    visual_parity: string;
    note: string;
  };
  quality: {
    total_rows: number;
    usable_rows: number;
    capture_count: number;
    usable_capture_count: number;
    boundary_rows: number;
    missing_pair_rows: number;
    snapshot_after_target_rows: number;
    min_interval_minutes: number;
    max_interval_minutes: number;
    usable_percent: number;
    status: string;
  };
  distribution: {
    count: number;
    positive_count: number;
    negative_count: number;
    sign_transitions: number;
    median: number | null;
    p05: number | null;
    p95: number | null;
    min: number | null;
    max: number | null;
  };
  latest: CharmSeriesPoint | null;
  series: CharmSeriesPoint[];
}

export interface CharmSurface {
  schema_version: 'trace-charm-surface.v1';
  date: string;
  status: 'experimental';
  requested_ts: string | null;
  ts: string;
  capture_id: string;
  spot: number;
  window_points: number;
  source: {
    snapshot_ts: string;
    model_ts: string;
    next_model_ts: string;
    interval_minutes: number;
    source_age_seconds: number;
    close_window: boolean;
  };
  nearest_flip: number | null;
  robust_abs_p95: number | null;
  rows: Array<{ spot: number; charm_per_minute: number }>;
}
