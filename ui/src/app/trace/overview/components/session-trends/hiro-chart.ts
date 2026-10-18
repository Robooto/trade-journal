import type { TraceDashboardRow } from '../../trace.models';
import { renderPriceLevels } from '../../trace-price-levels';
import { emptyHiroChart, HiroChart, HiroViewMode, TrendChartInput } from './trend-chart.models';
import { clamp, numericValue, captureChanges, robustAbsoluteLimit, paddedDomain, makeXScale, makeYScale, makeClampedYScale, valueSeriesPoints, seriesPoints, makeTicks, timeTicks, formatCompact, formatSignedCompact } from './trend-chart.utils';

export function buildHiroChart(input: TrendChartInput, mode: HiroViewMode): HiroChart {
  const chart = emptyHiroChart();
  if (input.rows.length < 2) {
    return chart;
  }

  const activeIndex = clamp(input.activeIndex, 0, input.rows.length - 1);
  const spxLevels = input.rows.map(row => numericValue(row.spx_hiro));
  const equitiesLevels = input.rows.map(row => numericValue(row.equities_hiro));
  const spxChanges = captureChanges(spxLevels);
  const equitiesChanges = captureChanges(equitiesLevels);
  const flowValues = mode === 'change'
    ? [spxChanges, equitiesChanges]
    : [spxLevels, equitiesLevels];
  const hiroValues = flowValues.flat()
    .filter((value): value is number => value != null);
  const spotValues = input.rows.map(row => numericValue(row.spot))
    .filter((value): value is number => value != null);
  if (!hiroValues.length || !spotValues.length) {
    return chart;
  }

  const hiroLimit = Math.max(1, robustAbsoluteLimit(hiroValues) * 1.1);
  const [spotMinimum, spotMaximum] = paddedDomain(spotValues, 12);
  const x = makeXScale(input.rows.length, input.width, 76, 72);
  const yHiro = makeClampedYScale(-hiroLimit, hiroLimit, input.height, 20, 46);
  const ySpot = makeYScale(spotMinimum, spotMaximum, input.height, 20, 46);
  const flowDefinitions = [
    {
      key: 'spx_hiro',
      label: mode === 'change' ? 'SPX HIRO change' : 'SPX HIRO',
      cssClass: 'trend-line--spx-hiro',
      values: mode === 'change' ? spxChanges : spxLevels,
    },
    {
      key: 'equities_hiro',
      label: mode === 'change' ? 'Equities HIRO change' : 'Equities HIRO',
      cssClass: 'trend-line--equities-hiro',
      values: mode === 'change' ? equitiesChanges : equitiesLevels,
    },
  ] as const;

  chart.hiroSeries = [
    ...flowDefinitions.map(series => ({
      key: series.key,
      label: series.label,
      cssClass: series.cssClass,
      points: valueSeriesPoints(series.values, x, yHiro),
    })),
    {
      key: 'spot',
      label: 'Spot',
      cssClass: 'trend-line--spot',
      points: seriesPoints(input.rows, 'spot', x, ySpot),
    },
  ].filter(series => Boolean(series.points));
  chart.hiroYTicks = makeTicks(-hiroLimit, hiroLimit, 5).map(value => ({
    position: yHiro(value),
    label: formatCompact(value),
  }));
  chart.spotYTicks = makeTicks(spotMinimum, spotMaximum, 5).map(value => ({
    position: ySpot(value),
    label: `${Math.round(value)}`,
  }));
  chart.hiroXTicks = timeTicks(input.rows, x);
  chart.hiroZeroY = yHiro(0);
  chart.hiroActiveX = x(activeIndex);
  chart.hiroPriceLevelMarkers = renderPriceLevels(input.priceLevels, spotMinimum, spotMaximum, ySpot);
  chart.hiroMarkers = [
    ...flowDefinitions.flatMap(series => {
      const value = series.values[activeIndex];
      return value == null ? [] : [{
        key: series.key,
        cssClass: series.cssClass,
        x: chart.hiroActiveX,
        y: yHiro(value),
      }];
    }),
    ...(() => {
      const value = numericValue(input.rows[activeIndex].spot);
      return value == null ? [] : [{
        key: 'spot',
        cssClass: 'trend-line--spot',
        x: chart.hiroActiveX,
        y: ySpot(value),
      }];
    })(),
  ];
  chart.hiroDirectionMarkers = [];
  const flags = flatHiroFlags(input.rows);
  const step = input.rows.length > 1 ? x(1) - x(0) : 0;
  chart.hiroFlatCount = flags.filter(Boolean).length;
  chart.hiroFlatBands = input.rows.flatMap((row, index) => !flags[index] ? [] : [{
    key: `${row.capture_id}-flat`,
    x: x(index) - step / 2,
    width: step,
    title: `Flat SPX HIRO: ${formatSignedCompact(numericValue(row.spx_hiro_change_30m) ?? 0)} over 30 minutes, under ${Math.round(FLAT_FRACTION * 100)}% of this session's typical 30-minute change so far.`,
  }]);
  chart.hiroBalanceMarkers = mode === 'change' ? [] : input.rows.flatMap((row, index) => {
    if (
      row.hiro_relationship_class !== 'opposing'
      || row.hiro_balance_bucket !== 'high'
      || row.hiro_balance_score == null
    ) return [];
    return [{
      key: `${row.capture_id}-high-opposing-balance`,
      x: x(index),
      title: `High opposing-flow balance: ${Math.round(row.hiro_balance_score * 100)}%. Descriptive research context only.`,
    }];
  });

  const jumpThreshold = 750_000_000;
  chart.hiroJumpMarkers = input.rows.slice(1).flatMap((row, offset) => {
    const index = offset + 1;
    return [
      { key: 'spx', level: spxLevels[index], change: spxChanges[index], label: 'SPX', cssClass: 'hiro-jump-marker--spx' },
      { key: 'equities', level: equitiesLevels[index], change: equitiesChanges[index], label: 'Equities', cssClass: 'hiro-jump-marker--equities' },
    ].flatMap(definition => {
      if (definition.change == null || definition.level == null || Math.abs(definition.change) < jumpThreshold) return [];
      const displayValue = mode === 'change' ? definition.change : definition.level;
      return [{
        key: `${row.capture_id}-${definition.key}-jump`,
        x: x(index),
        y: yHiro(displayValue),
        cssClass: definition.cssClass,
        title: `${definition.label} large HIRO move: ${formatSignedCompact(definition.change)} since prior capture. Magnitude context only.`,
      }];
    });
  });
  chart.hiroJumpCount = chart.hiroJumpMarkers.length;
  chart.hiroJumpLineYPositive = mode === 'change' && jumpThreshold <= hiroLimit
    ? yHiro(jumpThreshold)
    : null;
  chart.hiroJumpLineYNegative = mode === 'change' && jumpThreshold <= hiroLimit
    ? yHiro(-jumpThreshold)
    : null;
  chart.hiroHasData = chart.hiroSeries.length > 1;
  return chart;
}

/** Flat when |30-minute SPX HIRO change| is under this fraction of the session's median so far. */
export const FLAT_FRACTION = 0.35;
const FLAT_MIN_HISTORY = 6;

/**
 * Causal flat-HIRO flags: each capture is compared only with earlier captures in the session.
 * Sessions without minute-level HIRO changes (before October 18, 2026 backfill) return no flags.
 */
export function flatHiroFlags(rows: readonly TraceDashboardRow[]): boolean[] {
  const history: number[] = [];
  return rows.map(row => {
    const change = numericValue(row.spx_hiro_change_30m ?? null);
    if (change == null) return false;
    const absolute = Math.abs(change);
    let flat = false;
    if (history.length >= FLAT_MIN_HISTORY) {
      const sorted = [...history].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      flat = median > 0 && absolute < FLAT_FRACTION * median;
    }
    history.push(absolute);
    return flat;
  });
}
