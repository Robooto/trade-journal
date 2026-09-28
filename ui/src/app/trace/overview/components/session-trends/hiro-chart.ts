import { renderPriceLevels } from '../../trace-price-levels';
import { emptyHiroChart, HiroChart, HiroViewMode, TrendChartInput } from './trend-chart.models';
import { clamp, numericValue, captureChanges, robustAbsoluteLimit, paddedDomain, makeXScale, makeYScale, makeClampedYScale, valueSeriesPoints, seriesPoints, makeTicks, timeTicks, trianglePath, formatCompact, formatSignedCompact } from './trend-chart.utils';

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
  chart.hiroDirectionMarkers = mode === 'change' ? [] : input.rows.flatMap((row, index) => {
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
        title: `${definition.label} ${upward ? 'rising' : 'falling'} at ${formatSignedCompact(definition.rate)}/min`,
      }];
    });
  });
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
