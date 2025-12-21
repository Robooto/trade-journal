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
