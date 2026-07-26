import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import { TraceDashboardRow, TraceHistogramRow } from '../../trace.models';
import { selectKeyGexNodes } from '../../signed-gex-node-selection';

type PriceWindowMode = 'near' | 'full';
type NumericRowKey = keyof Pick<
  TraceDashboardRow,
  | 'spot'
  | 'put_wall'
  | 'hedge_wall'
  | 'call_wall'
  | 'global_shelf_center'
  | 'spx_hiro'
  | 'equities_hiro'
>;

interface AxisTick {
  readonly position: number;
  readonly label: string;
}

interface TrendSeries {
  readonly key: string;
  readonly label: string;
  readonly cssClass: string;
  readonly points: string;
}

interface ActiveMarker {
  readonly key: string;
  readonly cssClass: string;
  readonly x: number;
  readonly y: number;
}

interface StructureNodeMarker {
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

interface HiroDirectionMarker {
  readonly key: string;
  readonly path: string;
  readonly cssClass: string;
  readonly title: string;
}

const PRICE_SERIES: readonly {
  key: NumericRowKey;
  label: string;
  cssClass: string;
}[] = [
  { key: 'spot', label: 'Spot', cssClass: 'trend-line--spot' },
  { key: 'put_wall', label: 'Put wall', cssClass: 'trend-line--put' },
  { key: 'hedge_wall', label: 'Hedge wall', cssClass: 'trend-line--hedge' },
  { key: 'call_wall', label: 'Call wall', cssClass: 'trend-line--call' },
  { key: 'global_shelf_center', label: 'Shelf', cssClass: 'trend-line--shelf' },
];

@Component({
  selector: 'app-trace-session-trends',
  templateUrl: './session-trends.component.html',
  styleUrls: ['./session-trends.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class SessionTrendsComponent implements OnChanges {
  @Input() rows: readonly TraceDashboardRow[] = [];
  @Input() nodes: readonly TraceHistogramRow[] = [];
  @Input() activeIndex = 0;

  readonly width = 1200;
  readonly priceHeight = 330;
  readonly hiroHeight = 340;

  priceWindowMode: PriceWindowMode = 'near';
  priceSeries: readonly TrendSeries[] = [];
  priceYTicks: readonly AxisTick[] = [];
  priceXTicks: readonly AxisTick[] = [];
  priceMarkers: readonly ActiveMarker[] = [];
  priceNodeMarkers: readonly StructureNodeMarker[] = [];
  priceActiveX = 0;
  priceHasData = false;

  hiroSeries: readonly TrendSeries[] = [];
  hiroYTicks: readonly AxisTick[] = [];
  spotYTicks: readonly AxisTick[] = [];
  hiroXTicks: readonly AxisTick[] = [];
  hiroMarkers: readonly ActiveMarker[] = [];
  hiroDirectionMarkers: readonly HiroDirectionMarker[] = [];
  hiroZeroY = 0;
  hiroActiveX = 0;
  hiroHasData = false;

  ngOnChanges(): void {
    this.rebuildPriceChart();
    this.rebuildHiroChart();
  }

  setPriceWindowMode(mode: PriceWindowMode): void {
    if (mode === this.priceWindowMode) return;
    this.priceWindowMode = mode;
    this.rebuildPriceChart();
  }

  activeRow(): TraceDashboardRow | null {
    if (!this.rows.length) return null;
    return this.rows[clamp(this.activeIndex, 0, this.rows.length - 1)] ?? null;
  }

  formatCompact(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '\u2014';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '\u2212' : '';
    if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${Math.round(value * 10) / 10}`;
  }

  formatSignedCompact(value: number | null | undefined): string {
    const formatted = this.formatCompact(value);
    if (formatted === '\u2014' || value == null || value <= 0) return formatted;
    return `+${formatted}`;
  }

  directionArrow(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '\u2192';
    return value > 0 ? '\u2191' : '\u2193';
  }

  labelize(value: string | null | undefined): string {
    if (!value) return 'No acceleration label';
    return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  valueTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
    if (value == null || value === 0) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }

  private rebuildPriceChart(): void {
    if (this.rows.length < 2) {
      this.priceSeries = [];
      this.priceMarkers = [];
      this.priceNodeMarkers = [];
      this.priceHasData = false;
      return;
    }

    const activeIndex = clamp(this.activeIndex, 0, this.rows.length - 1);
    const [minimum, maximum] = this.priceDomain(activeIndex);
    const x = makeXScale(this.rows.length, this.width, 76, 72);
    const y = makeYScale(minimum, maximum, this.priceHeight, 20, 46);

    this.priceSeries = PRICE_SERIES.map(series => ({
      ...series,
      points: seriesPoints(this.rows, series.key, x, y),
    })).filter(series => Boolean(series.points));
    this.priceYTicks = makeTicks(minimum, maximum, 5).map(value => ({
      position: y(value),
      label: `${Math.round(value)}`,
    }));
    this.priceXTicks = timeTicks(this.rows, x);
    this.priceActiveX = x(activeIndex);
    this.priceMarkers = PRICE_SERIES.flatMap(series => {
      const value = numericValue(this.rows[activeIndex][series.key]);
      return value == null ? [] : [{
        key: series.key,
        cssClass: series.cssClass,
        x: this.priceActiveX,
        y: y(value),
      }];
    });
    const rowIndexByCapture = new Map(this.rows.map((row, index) => [row.capture_id, index]));
    const keyNodes = selectKeyGexNodes(this.nodes, this.rows);
    this.priceNodeMarkers = keyNodes.flatMap((node, nodeIndex) => {
      const rowIndex = rowIndexByCapture.get(node.capture_id);
      const strike = numericValue(node.center_strike);
      if (rowIndex == null || strike == null || strike < minimum || strike > maximum) return [];
      const share = Math.max(0, numericValue(node.cluster_share) ?? 0);
      const radius = 2.8 + Math.min(4.2, Math.sqrt(share) * 6);
      const negative = node.gamma_sign.toLowerCase() === 'negative';
      const markerX = x(rowIndex);
      const markerY = y(strike);
      const state = node.state?.toLowerCase() || 'unknown';
      return [{
        key: `${node.capture_id}-${node.gamma_sign}-${node.center_strike}-${nodeIndex}`,
        x: markerX,
        y: markerY,
        radius,
        negative,
        path: diamondPath(markerX, markerY, radius),
        cssClass: `structure-node--${state}`,
        opacity: state === 'forming' ? 0.58 : 0.72,
        title: `${negative ? 'Expansion (negative GEX)' : 'Containment (positive GEX)'} at ${Math.round(strike)} · ${this.labelize(node.state)} · ${Math.round(share * 1000) / 10}% share`,
      }];
    });
    this.priceHasData = this.priceSeries.length > 0;
  }

  private rebuildHiroChart(): void {
    if (this.rows.length < 2) {
      this.hiroSeries = [];
      this.hiroMarkers = [];
      this.hiroDirectionMarkers = [];
      this.hiroHasData = false;
      return;
    }

    const activeIndex = clamp(this.activeIndex, 0, this.rows.length - 1);
    const hiroValues = this.rows.flatMap(row => [row.spx_hiro, row.equities_hiro])
      .map(numericValue)
      .filter((value): value is number => value != null);
    const spotValues = this.rows.map(row => numericValue(row.spot))
      .filter((value): value is number => value != null);
    if (!hiroValues.length || !spotValues.length) {
      this.hiroSeries = [];
      this.hiroMarkers = [];
      this.hiroDirectionMarkers = [];
      this.hiroHasData = false;
      return;
    }

    const hiroLimit = Math.max(1, ...hiroValues.map(value => Math.abs(value))) * 1.08;
    const [spotMinimum, spotMaximum] = paddedDomain(spotValues, 12);
    const x = makeXScale(this.rows.length, this.width, 76, 72);
    const yHiro = makeYScale(-hiroLimit, hiroLimit, this.hiroHeight, 20, 46);
    const ySpot = makeYScale(spotMinimum, spotMaximum, this.hiroHeight, 20, 46);
    const seriesDefinitions: readonly {
      key: NumericRowKey;
      label: string;
      cssClass: string;
      scale: (value: number) => number;
    }[] = [
      { key: 'spx_hiro', label: 'SPX HIRO', cssClass: 'trend-line--spx-hiro', scale: yHiro },
      { key: 'equities_hiro', label: 'Equities HIRO', cssClass: 'trend-line--equities-hiro', scale: yHiro },
      { key: 'spot', label: 'Spot', cssClass: 'trend-line--spot', scale: ySpot },
    ];

    this.hiroSeries = seriesDefinitions.map(series => ({
      key: series.key,
      label: series.label,
      cssClass: series.cssClass,
      points: seriesPoints(this.rows, series.key, x, series.scale),
    })).filter(series => Boolean(series.points));
    this.hiroYTicks = makeTicks(-hiroLimit, hiroLimit, 5).map(value => ({
      position: yHiro(value),
      label: this.formatCompact(value),
    }));
    this.spotYTicks = makeTicks(spotMinimum, spotMaximum, 5).map(value => ({
      position: ySpot(value),
      label: `${Math.round(value)}`,
    }));
    this.hiroXTicks = timeTicks(this.rows, x);
    this.hiroZeroY = yHiro(0);
    this.hiroActiveX = x(activeIndex);
    this.hiroMarkers = seriesDefinitions.flatMap(series => {
      const value = numericValue(this.rows[activeIndex][series.key]);
      return value == null ? [] : [{
        key: series.key,
        cssClass: series.cssClass,
        x: this.hiroActiveX,
        y: series.scale(value),
      }];
    });
    this.hiroDirectionMarkers = this.rows.flatMap((row, index) => {
      const definitions = [
        { key: 'spx', value: numericValue(row.spx_hiro), rate: numericValue(row.spx_hiro_rate_per_minute), label: 'SPX' },
        { key: 'equities', value: numericValue(row.equities_hiro), rate: numericValue(row.equities_hiro_rate_per_minute), label: 'Equities' },
      ] as const;
      return definitions.flatMap(definition => {
        if (definition.value == null || definition.rate == null || definition.rate === 0) return [];
        const upward = definition.rate > 0;
        return [{
          key: `${row.capture_id}-${definition.key}`,
          path: trianglePath(x(index), yHiro(definition.value), upward, 4.5),
          cssClass: upward ? 'hiro-direction-marker--up' : 'hiro-direction-marker--down',
          title: `${definition.label} ${upward ? 'rising' : 'falling'} at ${this.formatSignedCompact(definition.rate)}/min`,
        }];
      });
    });
    this.hiroHasData = this.hiroSeries.length > 0;
  }

  private priceDomain(activeIndex: number): [number, number] {
    if (this.priceWindowMode === 'near') {
      const recent = this.rows.slice(Math.max(0, activeIndex - 12), activeIndex + 1);
      const spots = recent.map(row => numericValue(row.spot))
        .filter((value): value is number => value != null);
      if (spots.length) {
        const focusMinimum = Math.min(...spots) - 45;
        const focusMaximum = Math.max(...spots) + 45;
        const nearbyLevels = recent.flatMap(row => {
          const values = PRICE_SERIES.map(series => numericValue(row[series.key]));
          return values.filter((value): value is number =>
            value != null && value >= focusMinimum && value <= focusMaximum,
          );
        });
        return [
          Math.min(focusMinimum, ...spots, ...nearbyLevels) - 8,
          Math.max(focusMaximum, ...spots, ...nearbyLevels) + 8,
        ];
      }
    }

    const values = this.rows.flatMap(row => {
      const rowValues = PRICE_SERIES.map(series => numericValue(row[series.key]));
      return rowValues.filter((value): value is number => value != null);
    });
    return paddedDomain(values, 14);
  }
}

function diamondPath(x: number, y: number, radius: number): string {
  return `M ${x} ${y - radius} L ${x + radius} ${y} L ${x} ${y + radius} L ${x - radius} ${y} Z`;
}

function trianglePath(x: number, y: number, upward: boolean, radius: number): string {
  if (upward) return `M ${x} ${y - radius} L ${x + radius} ${y + radius} L ${x - radius} ${y + radius} Z`;
  return `M ${x} ${y + radius} L ${x + radius} ${y - radius} L ${x - radius} ${y - radius} Z`;
}

function seriesPoints(
  rows: readonly TraceDashboardRow[],
  key: NumericRowKey,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  return rows.flatMap((row, index) => {
    const value = numericValue(row[key]);
    return value == null ? [] : [`${x(index).toFixed(2)},${y(value).toFixed(2)}`];
  }).join(' ');
}

function makeXScale(
  rowCount: number,
  width: number,
  left: number,
  right: number,
): (index: number) => number {
  return index => left + index / Math.max(1, rowCount - 1) * (width - left - right);
}

function makeYScale(
  minimum: number,
  maximum: number,
  height: number,
  top: number,
  bottom: number,
): (value: number) => number {
  return value => top + (maximum - value) / Math.max(1, maximum - minimum) * (height - top - bottom);
}

function paddedDomain(values: readonly number[], padding: number): [number, number] {
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return [minimum - padding, maximum + padding];
  return [minimum - padding, maximum + padding];
}

function makeTicks(minimum: number, maximum: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    minimum + (maximum - minimum) * index / Math.max(1, count - 1),
  );
}

function timeTicks(
  rows: readonly TraceDashboardRow[],
  x: (index: number) => number,
): AxisTick[] {
  const step = Math.max(1, Math.ceil(rows.length / 7));
  return rows.flatMap((row, index) =>
    index % step === 0 || index === rows.length - 1
      ? [{ position: x(index), label: formatTime(row.ts) }]
      : [],
  );
}

function numericValue(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}