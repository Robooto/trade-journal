import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';

import { TraceGammaContextRow, TraceGammaProfileResponse } from '../../trace.models';

interface AxisTick {
  readonly position: number;
  readonly label: string;
}

interface ProfileBar {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cssClass: string;
  readonly title: string;
}

@Component({
  selector: 'app-trace-gamma-profile',
  templateUrl: './gamma-profile.component.html',
  styleUrls: ['./gamma-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class GammaProfileComponent implements OnChanges {
  @Input() gammaProfile: TraceGammaProfileResponse | null = null;
  @Input() gammaContextRows: readonly TraceGammaContextRow[] = [];
  @Input() captureTs: string | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Output() captureSelected = new EventEmitter<string>();

  readonly width = 600;
  readonly height = 240;
  readonly historyWidth = 600;
  readonly historyHeight = 220;
  points = '';
  bars: readonly ProfileBar[] = [];
  xTicks: readonly AxisTick[] = [];
  yTicks: readonly AxisTick[] = [];
  zeroY = 0;
  spotX = 0;
  markerX = 0;
  markerY = 0;
  nearestSpot = 0;
  nearestGamma = 0;
  gammaDirection = 'Flat';
  slopeDirection = 'Unavailable';
  curveDirection = 'Flat';
  sourceLabel = 'Latest available snapshot';
  hasData = false;

  get historyRows(): readonly TraceGammaContextRow[] {
    return this.gammaContextRows
      .filter(row => row.nearest_total_gamma != null && Number.isFinite(row.nearest_total_gamma))
      .slice()
      .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());
  }

  get historyPath(): string {
    const rows = this.historyRows;
    const scale = robustScale(rows.map(row => row.nearest_total_gamma!));
    return rows.map((row, index) => {
      const command = index ? 'L' : 'M';
      return `${command} ${this.historyX(index).toFixed(2)} ${historyY(row.nearest_total_gamma!, scale, this.historyHeight).toFixed(2)}`;
    }).join(' ');
  }

  get historyMinimum(): number | null {
    const values = this.historyRows.map(row => row.nearest_total_gamma!);
    return values.length ? Math.min(...values) : null;
  }

  get historyMaximum(): number | null {
    const values = this.historyRows.map(row => row.nearest_total_gamma!);
    return values.length ? Math.max(...values) : null;
  }

  get signTransitions(): number {
    const rows = this.historyRows;
    return rows.slice(1).filter((row, index) =>
      Math.sign(row.nearest_total_gamma!) !== Math.sign(rows[index].nearest_total_gamma!),
    ).length;
  }

  get persistentPositiveSteepeningWatch(): boolean {
    const rows = this.gammaContextRows
      .filter(row => row.cross_spot_slope != null && Number.isFinite(row.cross_spot_slope))
      .slice()
      .sort((left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime());
    const selectedIndex = rows.findIndex(row =>
      row.capture_id === this.gammaProfile?.capture_id || row.ts === this.captureTs,
    );
    if (selectedIndex < 3) return false;
    const slopes = rows
      .slice(selectedIndex - 3, selectedIndex + 1)
      .map(row => row.cross_spot_slope as number);
    return slopes.every(value => value > 0)
      && slopes.slice(1).every((value, index) => Math.abs(value) > Math.abs(slopes[index]));
  }

  get slopeWatchDetail(): string {
    return this.persistentPositiveSteepeningWatch
      ? 'Positive cross-spot slope has steepened for three consecutive captures. Research associates this state with weaker later SPX movement.'
      : '';
  }

  ngOnChanges(): void {
    const rows = this.gammaProfile?.rows ?? [];
    if (!rows.length) {
      this.points = '';
      this.bars = [];
      this.xTicks = [];
      this.yTicks = [];
      this.nearestSpot = 0;
      this.nearestGamma = 0;
      this.gammaDirection = 'Flat';
      this.slopeDirection = 'Unavailable';
      this.curveDirection = 'Flat';
      this.sourceLabel = 'Latest available snapshot';
      this.hasData = false;
      return;
    }

    const xMinimum = Math.min(...rows.map(row => row.spot));
    const xMaximum = Math.max(...rows.map(row => row.spot));
    const gammaLimit = Math.max(1, ...rows.map(row => Math.abs(row.gamma)));
    const x = (spot: number) => 50 + (spot - xMinimum) / Math.max(1, xMaximum - xMinimum) * (this.width - 76);
    const y = (gamma: number) => 18 + (gammaLimit - gamma) / (gammaLimit * 2) * (this.height - 54);
    const zeroY = y(0);
    const barWidth = Math.max(3, (this.width - 76) / Math.max(1, rows.length) * 0.66);

    this.points = rows.map(row => `${x(row.spot).toFixed(2)},${y(row.gamma).toFixed(2)}`).join(' ');
    this.bars = rows.map((row, index) => {
      const rowY = y(row.gamma);
      return {
        key: `${row.spot}:${index}`,
        x: x(row.spot) - barWidth / 2,
        y: Math.min(zeroY, rowY),
        width: barWidth,
        height: Math.max(1, Math.abs(zeroY - rowY)),
        cssClass: row.gamma >= 0 ? 'profile-bar--positive' : 'profile-bar--negative',
        title: `${row.spot.toFixed(1)} | ${this.formatCompact(row.gamma)}`,
      };
    });
    this.xTicks = makeTicks(xMinimum, xMaximum, 5).map(value => ({ position: x(value), label: `${Math.round(value)}` }));
    this.yTicks = [-gammaLimit, 0, gammaLimit].map(value => ({ position: y(value), label: this.formatCompact(value) }));
    this.zeroY = zeroY;
    this.spotX = x(this.gammaProfile?.spot ?? xMinimum);
    const nearest = [...rows].sort((left, right) =>
      Math.abs(left.spot - (this.gammaProfile?.spot ?? 0)) - Math.abs(right.spot - (this.gammaProfile?.spot ?? 0)),
    )[0];
    this.markerX = x(nearest.spot);
    this.markerY = y(nearest.gamma);
    this.nearestSpot = nearest.spot;
    this.nearestGamma = nearest.gamma;
    this.gammaDirection = directionLabel(nearest.gamma);
    this.slopeDirection = this.gammaProfile?.cross_spot_slope == null
      ? 'Unavailable'
      : directionLabel(this.gammaProfile.cross_spot_slope);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const curveSlope = rows.length < 2 || last.spot === first.spot
      ? 0
      : (last.gamma - first.gamma) / (last.spot - first.spot);
    this.curveDirection = directionLabel(curveSlope, 'Rising', 'Falling');
    this.sourceLabel = this.gammaProfile?.source.mode === 'feature_snap'
      ? 'Feature snapshot'
      : 'Latest available snapshot';
    this.hasData = true;
  }

  historyX(index: number): number {
    const count = this.historyRows.length;
    return 28 + (count <= 1 ? 0 : index / (count - 1) * (this.historyWidth - 56));
  }

  historyY(value: number): number {
    return historyY(value, robustScale(this.historyRows.map(row => row.nearest_total_gamma!)), this.historyHeight);
  }

  isSelected(row: TraceGammaContextRow): boolean {
    return row.capture_id === this.gammaProfile?.capture_id || row.ts === this.captureTs;
  }

  selectHistoryPoint(row: TraceGammaContextRow): void {
    this.captureSelected.emit(row.ts);
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
}

function makeTicks(minimum: number, maximum: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => minimum + (maximum - minimum) * index / Math.max(1, count - 1));
}

function directionLabel(
  value: number,
  positive = 'Positive',
  negative = 'Negative',
): string {
  return value > 0 ? positive : value < 0 ? negative : 'Flat';
}

function robustScale(values: number[]): number {
  const sorted = values.map(Math.abs).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 1;
  return sorted[Math.floor((sorted.length - 1) * .95)] || 1;
}

function historyY(value: number, scale: number, height: number): number {
  const clipped = Math.max(-scale, Math.min(scale, value));
  const transformed = Math.sign(clipped) * Math.log1p(Math.abs(clipped) / Math.max(scale / 12, 1));
  return height / 2 - transformed / Math.log1p(12) * (height / 2 - 24);
}
