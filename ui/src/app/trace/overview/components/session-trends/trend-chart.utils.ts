import type { TraceDashboardRow } from '../../trace.models';
import type { AxisTick, NumericRowKey } from './trend-chart.models';

export function diamondPath(x: number, y: number, radius: number): string {
  return `M ${x} ${y - radius} L ${x + radius} ${y} L ${x} ${y + radius} L ${x - radius} ${y} Z`;
}

export function trianglePath(x: number, y: number, upward: boolean, radius: number): string {
  if (upward) return `M ${x} ${y - radius} L ${x + radius} ${y + radius} L ${x - radius} ${y + radius} Z`;
  return `M ${x} ${y + radius} L ${x + radius} ${y - radius} L ${x - radius} ${y - radius} Z`;
}

export function seriesPoints(
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

export function valueSeriesPoints(
  values: readonly (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  return values.flatMap((value, index) =>
    value == null ? [] : [`${x(index).toFixed(2)},${y(value).toFixed(2)}`],
  ).join(' ');
}

export function captureChanges(values: readonly (number | null)[]): readonly (number | null)[] {
  return values.map((value, index) => {
    const previous = index > 0 ? values[index - 1] : null;
    return value == null || previous == null ? null : value - previous;
  });
}

export function robustAbsoluteLimit(values: readonly number[]): number {
  const sorted = values.map(Math.abs).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 1;
  return sorted[Math.floor((sorted.length - 1) * 0.95)] || 1;
}

export function makeXScale(
  rowCount: number,
  width: number,
  left: number,
  right: number,
): (index: number) => number {
  return index => left + index / Math.max(1, rowCount - 1) * (width - left - right);
}

export function makeYScale(
  minimum: number,
  maximum: number,
  height: number,
  top: number,
  bottom: number,
): (value: number) => number {
  return value => top + (maximum - value) / Math.max(1, maximum - minimum) * (height - top - bottom);
}

export function makeClampedYScale(
  minimum: number,
  maximum: number,
  height: number,
  top: number,
  bottom: number,
): (value: number) => number {
  const scale = makeYScale(minimum, maximum, height, top, bottom);
  return value => scale(clamp(value, minimum, maximum));
}

export function paddedDomain(values: readonly number[], padding: number): [number, number] {
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) return [minimum - padding, maximum + padding];
  return [minimum - padding, maximum + padding];
}

export function makeTicks(minimum: number, maximum: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    minimum + (maximum - minimum) * index / Math.max(1, count - 1),
  );
}

export function timeTicks(
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

export function numericValue(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

export function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '\u2014';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '\u2212' : '';
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
  return `${Math.round(value * 10) / 10}`;
}

export function formatSignedCompact(value: number | null | undefined): string {
  const formatted = formatCompact(value);
  if (formatted === '\u2014' || value == null || value <= 0) return formatted;
  return `+${formatted}`;
}

export function labelize(value: string | null | undefined): string {
  if (!value) return 'No acceleration label';
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}
