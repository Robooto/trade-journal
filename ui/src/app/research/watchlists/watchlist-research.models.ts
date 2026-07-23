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

export type WatchlistSort =
  | 'symbol'
  | 'ivr-desc'
  | 'ivr-change'
  | 'price-change'
  | 'iv-index-change';
