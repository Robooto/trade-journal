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
  warnings?: string[];
}

export interface BrokerActivityInbox {
  schema_version: 'broker-activity-inbox.v1';
  session_date: string;
  generated_at: string;
  events: BrokerActivityReviewEvent[];
  source_status: BrokerSourceStatus[];
  warnings: string[];
}

export interface JournalEntryPrefill {
  tickers?: string[];
  sourceLabel?: string;
  sourceUrl?: string;
  notes?: string;
}
