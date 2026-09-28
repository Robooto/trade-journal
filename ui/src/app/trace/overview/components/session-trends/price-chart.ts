import type { TraceDashboardRow, TraceHistogramRow } from '../../trace.models';
import { selectKeyGexNodes } from '../../signed-gex-node-selection';
import { renderPriceLevels } from '../../trace-price-levels';
import { emptyPriceChart, PriceChart, PriceWindowMode, NumericRowKey, TrendChartInput } from './trend-chart.models';
import { clamp, numericValue, makeXScale, makeYScale, makeTicks, timeTicks, seriesPoints, diamondPath, paddedDomain, labelize } from './trend-chart.utils';

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

export function buildPriceChart(input: TrendChartInput, nodes: readonly TraceHistogramRow[], mode: PriceWindowMode): PriceChart {
  const chart = emptyPriceChart();
  if (input.rows.length < 2) {
    return chart;
  }

  const activeIndex = clamp(input.activeIndex, 0, input.rows.length - 1);
  const [minimum, maximum] = priceDomain(input.rows, activeIndex, mode);
  const x = makeXScale(input.rows.length, input.width, 76, 72);
  const y = makeYScale(minimum, maximum, input.height, 20, 46);

  chart.priceSeries = PRICE_SERIES.map(series => ({
    ...series,
    points: seriesPoints(input.rows, series.key, x, y),
  })).filter(series => Boolean(series.points));
  chart.priceYTicks = makeTicks(minimum, maximum, 5).map(value => ({
    position: y(value),
    label: `${Math.round(value)}`,
  }));
  chart.priceXTicks = timeTicks(input.rows, x);
  chart.priceActiveX = x(activeIndex);
  chart.priceLevelMarkers = renderPriceLevels(input.priceLevels, minimum, maximum, y);
  chart.priceMarkers = PRICE_SERIES.flatMap(series => {
    const value = numericValue(input.rows[activeIndex][series.key]);
    return value == null ? [] : [{
      key: series.key,
      cssClass: series.cssClass,
      x: chart.priceActiveX,
      y: y(value),
    }];
  });
  const rowIndexByCapture = new Map(input.rows.map((row, index) => [row.capture_id, index]));
  const keyNodes = selectKeyGexNodes(nodes, input.rows);
  chart.priceNodeMarkers = keyNodes.flatMap((node, nodeIndex) => {
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
      title: `${negative ? 'Expansion (negative GEX)' : 'Containment (positive GEX)'} at ${Math.round(strike)} · ${labelize(node.state)} · ${Math.round(share * 1000) / 10}% share`,
    }];
  });
  chart.priceHasData = chart.priceSeries.length > 0;
  return chart;
}

function priceDomain(rows: readonly TraceDashboardRow[], activeIndex: number, mode: PriceWindowMode): [number, number] {
  if (mode === 'near') {
    const recent = rows.slice(Math.max(0, activeIndex - 12), activeIndex + 1);
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

  const values = rows.flatMap(row => {
    const rowValues = PRICE_SERIES.map(series => numericValue(row[series.key]));
    return rowValues.filter((value): value is number => value != null);
  });
  return paddedDomain(values, 14);
}
