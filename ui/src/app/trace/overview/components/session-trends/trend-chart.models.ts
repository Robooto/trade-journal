import type { TraceDashboardRow } from '../../trace.models';
import type { RenderedPriceLevel, TracePriceLevel } from '../../trace-price-levels';

export type PriceWindowMode = 'near' | 'full';
export type HiroViewMode = 'change' | 'level';
export type NumericRowKey = keyof Pick<
  TraceDashboardRow,
  | 'spot'
  | 'put_wall'
  | 'hedge_wall'
  | 'call_wall'
  | 'global_shelf_center'
  | 'spx_hiro'
  | 'equities_hiro'
>;

export interface AxisTick {
  readonly position: number;
  readonly label: string;
}

export interface TrendSeries {
  readonly key: string;
  readonly label: string;
  readonly cssClass: string;
  readonly points: string;
}

export interface ActiveMarker {
  readonly key: string;
  readonly cssClass: string;
  readonly x: number;
  readonly y: number;
}

export interface StructureNodeMarker {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly negative: boolean;
  readonly path: string;
  readonly cssClass: string;
  readonly opacity: number;
  readonly title: string;
}

export interface HiroDirectionMarker {
  readonly key: string;
  readonly path: string;
  readonly cssClass: string;
  readonly title: string;
}

export interface HiroJumpMarker {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly cssClass: string;
  readonly title: string;
}

export interface HiroBalanceMarker {
  readonly key: string;
  readonly x: number;
  readonly title: string;
}

export interface TrendChartInput {
  rows: readonly TraceDashboardRow[];
  activeIndex: number;
  priceLevels: readonly TracePriceLevel[];
  width: number;
  height: number;
}

export interface PriceChart {
  priceSeries: readonly TrendSeries[];
  priceYTicks: readonly AxisTick[];
  priceXTicks: readonly AxisTick[];
  priceMarkers: readonly ActiveMarker[];
  priceNodeMarkers: readonly StructureNodeMarker[];
  priceLevelMarkers: readonly RenderedPriceLevel[];
  priceActiveX: number;
  priceHasData: boolean;
}

export function emptyPriceChart(): PriceChart {
  return {
    priceSeries: [],
    priceYTicks: [],
    priceXTicks: [],
    priceMarkers: [],
    priceNodeMarkers: [],
    priceLevelMarkers: [],
    priceActiveX: 0,
    priceHasData: false,
  };
}

export interface HiroFlatBand {
  readonly key: string;
  readonly x: number;
  readonly width: number;
  readonly title: string;
}

export interface HiroChart {
  hiroSeries: readonly TrendSeries[];
  hiroYTicks: readonly AxisTick[];
  spotYTicks: readonly AxisTick[];
  hiroXTicks: readonly AxisTick[];
  hiroMarkers: readonly ActiveMarker[];
  hiroDirectionMarkers: readonly HiroDirectionMarker[];
  hiroJumpMarkers: readonly HiroJumpMarker[];
  hiroBalanceMarkers: readonly HiroBalanceMarker[];
  hiroFlatBands: readonly HiroFlatBand[];
  hiroFlatCount: number;
  hiroPriceLevelMarkers: readonly RenderedPriceLevel[];
  hiroJumpLineYPositive: number | null;
  hiroJumpLineYNegative: number | null;
  hiroJumpCount: number;
  hiroZeroY: number;
  hiroActiveX: number;
  hiroHasData: boolean;
}

export function emptyHiroChart(): HiroChart {
  return {
    hiroSeries: [],
    hiroYTicks: [],
    spotYTicks: [],
    hiroXTicks: [],
    hiroMarkers: [],
    hiroDirectionMarkers: [],
    hiroJumpMarkers: [],
    hiroBalanceMarkers: [],
    hiroFlatBands: [],
    hiroFlatCount: 0,
    hiroPriceLevelMarkers: [],
    hiroJumpLineYPositive: null,
    hiroJumpLineYNegative: null,
    hiroJumpCount: 0,
    hiroZeroY: 0,
    hiroActiveX: 0,
    hiroHasData: false,
  };
}
