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
  readonly brokerage_context: FlowBrokerageContext | null;
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


export interface FlowBrokerageSourceStatus {
  readonly source: string;
  readonly status: 'ok' | 'partial' | 'unavailable' | string;
  readonly detail?: string | null;
}

export interface FlowBrokerageContext {
  readonly symbol: string;
  readonly watchlists: readonly {
    readonly name: string;
    readonly group_name?: string | null;
    readonly source: 'private' | 'public' | string;
  }[];
  readonly price: {
    readonly mark?: number | null;
    readonly previous_close?: number | null;
    readonly day_change_percent?: number | null;
    readonly five_session_change_percent?: number | null;
    readonly as_of?: string | null;
  };
  readonly volatility: {
    readonly iv_index_percent?: number | null;
    readonly iv_rank_percent?: number | null;
    readonly iv_percentile_percent?: number | null;
    readonly iv_index_5_day_change_percent?: number | null;
    readonly iv_rank_5_day_change_percent?: number | null;
    readonly liquidity_rating?: number | null;
    readonly as_of?: string | null;
  };
  readonly earnings: {
    readonly status: 'confirmed' | 'estimated' | 'unavailable';
    readonly earnings_date?: string | null;
    readonly earnings_time?: string | null;
    readonly source?: string | null;
    readonly detail?: string | null;
  };
  readonly exposure: {
    readonly is_held: boolean;
    readonly account_numbers: readonly string[];
    readonly asset_classes: readonly string[];
    readonly net_underlying_quantity?: number | null;
    readonly option_position_count: number;
  };
  readonly source_status: readonly FlowBrokerageSourceStatus[];
  readonly warnings: readonly string[];
}

export interface FlowHistoryRow {
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
  readonly delta_percentile?: number | null;
  readonly gamma_percentile?: number | null;
  readonly vega_percentile?: number | null;
  readonly equityhub_url: string;
}

export interface FlowSymbolHistoryResponse {
  readonly schema_version: 'flowpatrol-symbol-history.v1';
  readonly symbol: string;
  readonly rows: readonly FlowHistoryRow[];
}

export interface FlowContractEvidenceRow {
  readonly report_date: string;
  readonly trading_date: string;
  readonly symbol: string;
  readonly spread_id: string | null;
  readonly section: string | null;
  readonly source_page: number | null;
  readonly source_row_index: number | null;
  readonly measure_name: string | null;
  readonly measure_value_usd: number | null;
  readonly source_row_text: string | null;
  readonly review_status: string | null;
}

export interface FlowContractsResponse {
  readonly schema_version: 'flowpatrol-contracts.v1';
  readonly trading_date: string;
  readonly symbol: string;
  readonly status: FlowReportStatus;
  readonly rows: readonly FlowContractEvidenceRow[];
}

export interface FlowContractEvidenceGroup {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly FlowContractEvidenceRow[];
}
