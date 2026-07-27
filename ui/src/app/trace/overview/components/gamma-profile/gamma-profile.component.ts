import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import { TraceGammaProfileResponse } from '../../trace.models';

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
  @Input() loading = false;
  @Input() error: string | null = null;

  readonly width = 600;
  readonly height = 240;
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
