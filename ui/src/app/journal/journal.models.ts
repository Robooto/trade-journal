export interface JournalEvent {
  time: string;
  price: number;
  note: string;
}

export interface JournalEntry {
  id: string;            // uuid
  date: string;
  esPrice: number;
  delta?: number | null;
  notes: string;
  events: JournalEvent[];
  marketDirection: 'up' | 'down';
  tickers?: string[];
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

export interface PaginatedJournalEntries {
  total: number;
  items: JournalEntry[];
  skip: number;
  limit: number;
}

export interface MarketData {
  [key: string]: any;
}

export interface BrokerSourceStatus {
  source: string;
  endpoint: string;
  fetched_at: string;
  status: 'ok' | 'partial' | 'stale' | 'unavailable';
  warnings?: string[];
}

export interface BrokerActivityLeg {
  activity_id: string;
  kind: string;
  occurred_at: string;
  symbol?: string | null;
  underlying_symbol?: string | null;
  action?: string | null;
  quantity?: number | null;
  price?: number | null;
  description?: string | null;
  warnings?: string[];
}

export interface BrokerActivityMarketBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrokerActivitySymbolContext {
  symbol: string;
  source_symbol: string;
  source: 'yahoo_chart';
  status: 'ok' | 'partial' | 'stale' | 'unavailable';
  resolution: '5m';
  activity_price?: number | null;
  matched_at?: string | null;
  match_quality: 'nearest_5m_close' | 'session_only' | 'unavailable';
  minutes_from_activity?: number | null;
  session_open?: number | null;
  session_high?: number | null;
  session_low?: number | null;
  session_close?: number | null;
  session_change_percent?: number | null;
  activity_from_open_percent?: number | null;
  bars: BrokerActivityMarketBar[];
  warnings: string[];
}

export interface BrokerActivityMarketContext {
  schema_version: 'broker-activity-market-context.v1';
  underlying?: BrokerActivitySymbolContext | null;
  benchmark?: BrokerActivitySymbolContext | null;
  warnings: string[];
}

export interface BrokerActivityReviewEvent {
  activity_group_id: string;
  session_date: string;
  account_number: string;
  review_kind: string;
  occurred_at: string;
  underlying_symbol?: string | null;
  grouping_status: 'explicit' | 'ungrouped' | 'ambiguous';
  order_status?: string | null;
  order_type?: string | null;
  order_price?: number | null;
  order_price_effect?: string | null;
  leg_count: number;
  legs: BrokerActivityLeg[];
  net_value_dollars?: number | null;
  fees_dollars?: number | null;
  summary: string;
  review_status: 'pending' | 'reviewed' | 'skipped';
  journal_entry_id?: string | null;
  market_context?: BrokerActivityMarketContext | null;
  warnings?: string[];
}

export interface BrokerActivityInbox {
  schema_version: 'broker-activity-inbox.v1';
  session_date: string;
  generated_at: string;
  events: BrokerActivityReviewEvent[];
  source_status: BrokerSourceStatus[];
  pending_count: number;
  reviewed_count: number;
  skipped_count: number;
  warnings: string[];
}

export type BrokerActivityDispositionStatus = 'reviewed' | 'skipped';

export interface BrokerActivityDisposition {
  schema_version: 'broker-activity-disposition.v1';
  activity_group_id: string;
  session_date: string;
  status: BrokerActivityDispositionStatus;
  journal_entry_id?: string | null;
  updated_at: string;
}

export interface JournalEntryPrefill {
  tickers?: string[];
  sourceLabel?: string;
  sourceUrl?: string;
  notes?: string;
  activityGroupId?: string;
  activitySessionDate?: string;
}
