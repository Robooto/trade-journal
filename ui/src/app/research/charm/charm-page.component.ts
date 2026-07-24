import { Component, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, Subscription } from 'rxjs';

import { CharmApiService } from './charm-api.service';
import { CharmOverview, CharmSeriesPoint, CharmSurface } from './charm.models';

@Component({
  selector: 'app-charm-page',
  templateUrl: './charm-page.component.html',
  styleUrls: ['./charm-page.component.scss'],
  standalone: false,
})
export class CharmPageComponent implements OnInit, OnDestroy {
  dates: string[] = [];
  selectedDate = '';
  selectedTs: string | null = null;
  windowPoints = 60;
  overview: CharmOverview | null = null;
  surface: CharmSurface | null = null;
  loading = false;
  surfaceLoading = false;
  error: string | null = null;

  readonly chartWidth = 960;
  readonly chartHeight = 260;
  private readonly subscriptions = new Subscription();

  constructor(private readonly api: CharmApiService) {}

  ngOnInit(): void {
    this.loading = true;
    this.subscriptions.add(this.api.dates().subscribe({
      next: response => {
        this.dates = response.dates;
        if (!this.dates.length) {
          this.error = 'No validated Charm sessions are available yet.';
          this.loading = false;
          return;
        }
        this.selectedDate = this.dates[0];
        this.loadSession();
      },
      error: error => this.fail(error),
    }));
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  loadSession(): void {
    if (!this.selectedDate) return;
    this.loading = true;
    this.error = null;
    this.subscriptions.add(forkJoin({
      overview: this.api.overview(this.selectedDate),
      surface: this.api.surface(this.selectedDate, null, this.windowPoints),
    }).subscribe({
      next: result => {
        this.overview = result.overview;
        this.surface = result.surface;
        this.selectedTs = result.surface.ts;
        this.loading = false;
      },
      error: error => this.fail(error),
    }));
  }

  loadSurface(): void {
    if (!this.selectedDate) return;
    this.surfaceLoading = true;
    this.subscriptions.add(this.api.surface(this.selectedDate, this.selectedTs, this.windowPoints).subscribe({
      next: surface => {
        this.surface = surface;
        this.selectedTs = surface.ts;
        this.surfaceLoading = false;
      },
      error: error => {
        this.surfaceLoading = false;
        this.error = error?.error?.detail || 'The selected Charm surface is unavailable.';
      },
    }));
  }

  selectPoint(point: CharmSeriesPoint): void {
    this.selectedTs = point.ts;
    this.loadSurface();
  }

  get selectedPoint(): CharmSeriesPoint | null {
    return this.overview?.series.find(point => point.ts === this.selectedTs) ?? this.overview?.latest ?? null;
  }

  get historyPath(): string {
    const rows = this.overview?.series ?? [];
    const scale = robustScale(rows.map(row => row.charm_at_market));
    return pathFor(rows.map((row, index) => ({
      x: chartX(index, rows.length, this.chartWidth),
      y: chartY(row.charm_at_market, scale, this.chartHeight),
    })));
  }

  historyX(index: number): number {
    return chartX(index, this.overview?.series.length ?? 0, this.chartWidth);
  }

  historyY(value: number): number {
    return chartY(value, robustScale((this.overview?.series ?? []).map(row => row.charm_at_market)), this.chartHeight);
  }

  get surfacePath(): string {
    const rows = this.surface?.rows ?? [];
    if (!rows.length) return '';
    const min = rows[0].spot;
    const max = rows[rows.length - 1].spot;
    const scale = this.surface?.robust_abs_p95 || robustScale(rows.map(row => row.charm_per_minute));
    return pathFor(rows.map(row => ({
      x: rangeX(row.spot, min, max, this.chartWidth),
      y: chartY(row.charm_per_minute, scale, this.chartHeight),
    })));
  }

  get spotX(): number | null { return this.surfaceMarkerX(this.surface?.spot); }
  get flipX(): number | null { return this.surfaceMarkerX(this.surface?.nearest_flip); }

  formatPressure(value: number | null | undefined): string {
    if (value == null) return 'Unavailable';
    const absolute = Math.abs(value);
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(2)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${sign}${absolute.toFixed(0)}`;
  }

  formatPoints(value: number | null | undefined): string {
    if (value == null) return 'Unavailable';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
  }

  private surfaceMarkerX(value: number | null | undefined): number | null {
    const rows = this.surface?.rows ?? [];
    if (value == null || !rows.length) return null;
    return rangeX(value, rows[0].spot, rows[rows.length - 1].spot, this.chartWidth);
  }

  private fail(error: any): void {
    this.error = error?.error?.detail || 'Charm research is unavailable right now.';
    this.loading = false;
  }
}

function robustScale(values: number[]): number {
  const sorted = values.map(Math.abs).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return sorted[Math.floor((sorted.length - 1) * .95)] || 1;
}

function chartX(index: number, count: number, width: number): number {
  return 28 + (count <= 1 ? 0 : index / (count - 1) * (width - 56));
}

function rangeX(value: number, min: number, max: number, width: number): number {
  return 28 + (max === min ? 0 : (value - min) / (max - min) * (width - 56));
}

function chartY(value: number, scale: number, height: number): number {
  const clipped = Math.max(-scale, Math.min(scale, value));
  const transformed = Math.sign(clipped) * Math.log1p(Math.abs(clipped) / Math.max(scale / 12, 1));
  const limit = Math.log1p(12);
  return height / 2 - transformed / limit * (height / 2 - 24);
}

function pathFor(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}
