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