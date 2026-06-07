export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartResponse {
  s: string;
  bars: Bar[];
}

export interface ChartParams {
  symbol: string;
  resolution: string;
  from_ts: number;
  to_ts: number;
  spotgamma?: ManualSpotGammaInput;
}

export interface ManualSpotGammaInput {
  spot?: number;
  lowVolatilityPoint?: number;
  highVolatilityPoint?: number;
  callGammaNotional?: number;
  putGammaNotional?: number;
  topGammaExpiration?: string;
  majorGammaStrikes?: number[];
  notes?: string;
}

export interface PriceLine {
  id: string;
  price: number;
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  label?: string;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type LineColor = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'orange';

export interface RawOptionExpirationVolatility {
  'expiration-date': string;
  'implied-volatility'?: string;
  'option-chain-type'?: string;
  'settlement-type'?: string;
}

export interface RawVolatilityData {
  symbol: string;
  'implied-volatility-index'?: string;
  'implied-volatility-index-15-day'?: string;
  'implied-volatility-index-5-day-change'?: string;
  'implied-volatility-index-rank'?: string;
  'implied-volatility-percentile'?: string;
  'corr-spy-3month'?: string;
  'liquidity-rating'?: number | string;
  'option-expiration-implied-volatilities'?: RawOptionExpirationVolatility[];
}

export interface OptionExpirationVolatility {
  expirationDate: string;
  impliedVolatility: number | null;
  optionChainType?: string;
  settlementType?: string;
}

export interface VolatilityData {
  symbol: string;
  impliedVolatilityIndex: number | null;
  impliedVolatilityIndex15Day: number | null;
  impliedVolatilityIndex5DayChange: number | null;
  impliedVolatilityIndexRank: number | null;
  impliedVolatilityPercentile: number | null;
  corrSpy3Month: number | null;
  liquidityRating: number | null;
  optionExpirationImpliedVolatilities: OptionExpirationVolatility[];
}

export interface RawMarketData {
  symbol: string;
  [key: string]: string | number | boolean | null | undefined;
}

export interface SourceStatus {
  source: string;
  status: 'ok' | 'partial' | 'unavailable';
  detail?: string;
}

export interface EquityAnalysisPackage {
  schema_version: 'equity-analysis-package.v1';
  analysis_profile: 'sam-equity-options.v1';
  analysis_instructions: string;
  generated_at: string;
  symbol: string;
  as_of_date: string;
  window: {
    resolution: string;
    from_ts: number;
    to_ts: number;
  };
  equity_hub_url: string;
  market?: RawMarketData;
  volatility?: {
    current_iv_percent?: number;
    iv_15_day_percent?: number;
    iv_rank_percent?: number;
    iv_percentile_percent?: number;
    iv_5_day_change_percent?: number;
    corr_spy_3_month?: number;
    liquidity_rating?: number;
    term_structure: Array<{
      expiration_date: string;
      implied_volatility_percent?: number;
      option_chain_type?: string;
      settlement_type?: string;
    }>;
  };
  chart_features: {
    bar_count: number;
    first_close?: number;
    last_close?: number;
    change_percent?: number;
    window_high?: number;
    window_low?: number;
    average_volume?: number;
  };
  chart_bars: Bar[];
  spotgamma: {
    source: 'manual' | 'captured' | 'unavailable';
    equity_hub_url: string;
    spot?: number;
    low_volatility_point?: number;
    high_volatility_point?: number;
    call_gamma_notional?: number;
    put_gamma_notional?: number;
    top_gamma_expiration?: string;
    major_gamma_strikes: number[];
    notes?: string;
  };
  catalysts: {
    source: 'manual' | 'captured' | 'unavailable';
    earnings_date?: string;
    earnings_time?: string;
    events: string[];
    notes?: string;
  };
  portfolio_exposure: {
    status: 'ok' | 'unavailable';
    matching_groups: number;
    buying_power_effect?: number;
    beta_delta?: number;
    account_percent_used_bp?: number;
    notes: string[];
  };
  source_status: SourceStatus[];
  warnings: string[];
}
