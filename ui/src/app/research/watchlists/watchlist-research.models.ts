export type ResearchSourceStatus = 'ok' | 'partial' | 'stale' | 'unavailable' | string;

export interface ResearchWatchlistSummary {
  readonly name: string;
  readonly group_name?: string | null;
  readonly order_index?: number | null;
  readonly symbols: readonly string[];
  readonly symbol_count: number;
}

export interface ResearchSourceMetadata {
  readonly source: string;
  readonly endpoint?: string | null;
  readonly fetched_at: string;
  readonly observed_at?: string | null;
  readonly status: ResearchSourceStatus;
  readonly missing_fields: readonly string[];
  readonly warnings: readonly string[];
}

export interface WatchlistResearchItem {
  readonly symbol: string;
  readonly watchlists: readonly {
    readonly name: string;
    readonly group_name?: string | null;
    readonly source: string;
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
    readonly iv_rank_source?: string | null;
    readonly iv_index_15_day_percent?: number | null;
    readonly iv_30_day_percent?: number | null;
    readonly hv_30_day_percent?: number | null;
    readonly hv_60_day_percent?: number | null;
    readonly hv_90_day_percent?: number | null;
    readonly iv_hv_30_day_difference_points?: number | null;
    readonly liquidity_rating?: number | null;
    readonly liquidity_rank?: number | null;
    readonly as_of?: string | null;
  };
  readonly earnings: {
    readonly status: 'confirmed' | 'estimated' | 'unavailable';
    readonly earnings_date?: string | null;
    readonly earnings_time?: string | null;
    readonly source?: string | null;
    readonly detail?: string | null;
  };
  readonly profile?: {
    readonly sector?: string | null;
    readonly industry?: string | null;
    readonly market_cap?: number | null;
    readonly beta?: number | null;
    readonly dividend_yield_percent?: number | null;
    readonly dividend_ex_date?: string | null;
    readonly lendability?: string | null;
  };
  readonly exposure: {
    readonly is_held: boolean;
    readonly account_numbers: readonly string[];
    readonly asset_classes: readonly string[];
    readonly net_underlying_quantity?: number | null;
    readonly option_position_count: number;
  };
  readonly source_status: readonly ResearchSourceMetadata[];
  readonly warnings: readonly string[];
}

export interface WatchlistResearchResponse {
  readonly schema_version: 'broker-watchlist-research.v1';
  readonly generated_at: string;
  readonly writes_enabled: boolean;
  readonly watchlists: readonly ResearchWatchlistSummary[];
  readonly items: readonly WatchlistResearchItem[];
  readonly missing_symbols: readonly string[];
  readonly source_status: readonly ResearchSourceMetadata[];
}

export interface WatchlistSymbolAddResponse {
  readonly schema_version: 'watchlist-symbol-write.v1';
  readonly watchlist: ResearchWatchlistSummary;
  readonly symbol: string;
  readonly added: boolean;
}

export type WatchlistSort =
  | 'symbol'
  | 'ivr-desc'
  | 'iv-hv-desc'
  | 'earnings-soonest'
  | 'ivr-change'
  | 'price-change'
  | 'iv-index-change';
