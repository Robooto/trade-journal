export type FlowReportStatus = 'ready' | 'partial' | 'missing';

export interface FlowReportDate {
  readonly trading_date: string;
  readonly status: FlowReportStatus;
  readonly candidate_count: number;
  readonly quality_issue_count: number;
}

export interface FlowDatesResponse {
  readonly schema_version: 'flowpatrol-dates.v1';
  readonly dates: readonly FlowReportDate[];
}

export interface FlowBrokerageEnrichment {
  readonly schema_version: string;
  readonly status:
    | 'ready'
    | 'partial'
    | 'unavailable'
    | 'disabled'
    | 'not_requested';
  readonly requested_symbol_count: number;
  readonly matched_symbol_count: number;
  readonly missing_symbols?: readonly string[];
  readonly warnings: readonly string[];
}

export interface FlowCandidate {
  readonly trading_date: string;
  readonly symbol: string;
  readonly research_priority: number | null;
  readonly active_watch: boolean | null;
  readonly watch_day: number | null;
  readonly appearance_streak?: number | null;
  readonly change_event: string | null;
  readonly reason_codes: readonly string[];
  readonly reason_text: string | null;
  readonly spread_ids: readonly string[];
  readonly asset_type: string;
  readonly is_index_etf: boolean;
  readonly in_unusual?: boolean | null;
  readonly delta_percentile?: number | null;
  readonly gamma_percentile?: number | null;
  readonly vega_percentile?: number | null;
  readonly sector?: string | null;
  readonly equityhub_url: string;
  readonly brokerage_context: unknown | null;
}

export interface FlowCandidatesResponse {
  readonly schema_version: 'flowpatrol-candidates.v1';
  readonly trading_date: string;
  readonly status: FlowReportStatus;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly rows: readonly FlowCandidate[];
  readonly brokerage_enrichment: FlowBrokerageEnrichment;
}

export interface FlowIdeasServerFilters {
  readonly tradingDate: string;
  readonly symbol: string;
  readonly event: string;
  readonly activeOnly: boolean;
}

export interface FlowIdeasDisplayFilters {
  readonly includeIndexEtfs: boolean;
}

export interface FlowIdeasRouteState {
  readonly server: FlowIdeasServerFilters;
  readonly display: FlowIdeasDisplayFilters;
}

export interface FlowIdeaMetrics {
  readonly active: number;
  readonly persistent: number;
  readonly unusual: number;
  readonly changed: number;
}

export interface FlowApiErrorBody {
  readonly detail?: string;
  readonly error?: {
    readonly schema_version: 'flowpatrol-error.v1';
    readonly code: string;
    readonly message: string;
  };
}
