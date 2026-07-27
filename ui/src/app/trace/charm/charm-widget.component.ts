import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { CharmApiService } from './charm-api.service';
import { CharmOverview, CharmSeriesPoint, CharmSurface } from './charm.models';

@Component({
  selector: 'app-charm-widget',
  templateUrl: './charm-widget.component.html',
  styleUrls: ['./charm-widget.component.scss'],
  standalone: false,
})
export class CharmWidgetComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() captureTs: string | null = null;
  @Input() overview: CharmOverview | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Output() captureSelected = new EventEmitter<string>();
  @Output() refreshRequested = new EventEmitter<void>();

  selectedTs: string | null = null;
  windowPoints = 60;
  surface: CharmSurface | null = null;
  surfaceLoading = false;
  surfaceError: string | null = null;

  readonly chartWidth = 960;
  readonly chartHeight = 250;
  private surfaceSubscription: Subscription | null = null;

  constructor(private readonly api: CharmApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['date'] && !changes['captureTs'] && !changes['overview']) return;
    const nextTs = this.captureTs ?? this.overview?.latest?.ts ?? null;
    if (!this.date || !nextTs) {
      this.selectedTs = nextTs;
      this.surface = null;
      return;
    }
    if (nextTs !== this.selectedTs || changes['date']) {
      this.selectedTs = nextTs;
      this.loadSurface();
    }
  }

  ngOnDestroy(): void {
    this.surfaceSubscription?.unsubscribe();
  }

  loadSurface(): void {
    if (!this.date || !this.selectedTs) return;
    this.surfaceSubscription?.unsubscribe();
    this.surfaceLoading = true;
    this.surfaceError = null;
    this.surfaceSubscription = this.api.surface(this.date, this.selectedTs, this.windowPoints).subscribe({
      next: surface => {
        this.surface = surface;
        this.selectedTs = surface.ts;
        this.surfaceLoading = false;
      },
      error: error => {
        this.surfaceLoading = false;
        this.surfaceError = error?.error?.detail || 'The selected Charm surface is unavailable.';
      },
    });
  }

  refresh(): void {
    this.refreshRequested.emit();
    this.loadSurface();
  }

  selectPoint(point: CharmSeriesPoint): void {
    this.selectedTs = point.ts;
    this.captureSelected.emit(point.ts);
    this.loadSurface();
  }

  get selectedPoint(): CharmSeriesPoint | null {
    const rows = this.overview?.series ?? [];
    if (!rows.length) return null;
    if (!this.selectedTs) return this.overview?.latest ?? rows[rows.length - 1];
    return rows.find(point => point.ts === this.selectedTs) ?? nearestPoint(rows, this.selectedTs);
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
    const minimum = rows[0].spot;
    const maximum = rows[rows.length - 1].spot;
    const scale = this.surface?.robust_abs_p95 || robustScale(rows.map(row => row.charm_per_minute));
    return pathFor(rows.map(row => ({
      x: rangeX(row.spot, minimum, maximum, this.chartWidth),
      y: chartY(row.charm_per_minute, scale, this.chartHeight),
    })));
  }

  get spotX(): number | null { return this.surfaceMarkerX(this.surface?.spot); }
  get flipX(): number | null { return this.surfaceMarkerX(this.surface?.nearest_flip); }

  formatPressure(value: number | null | undefined): string {
    if (value == null) return 'Unavailable';
    const absolute = Math.abs(value);
    const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
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
}

function nearestPoint(rows: readonly CharmSeriesPoint[], target: string): CharmSeriesPoint {
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return rows[rows.length - 1];
  return [...rows].sort((left, right) =>
    Math.abs(new Date(left.ts).getTime() - targetMs) - Math.abs(new Date(right.ts).getTime() - targetMs),
  )[0];
}

function robustScale(values: number[]): number {
  const sorted = values.map(Math.abs).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  return sorted[Math.floor((sorted.length - 1) * .95)] || 1;
}

function chartX(index: number, count: number, width: number): number {
  return 28 + (count <= 1 ? 0 : index / (count - 1) * (width - 56));
}

function rangeX(value: number, minimum: number, maximum: number, width: number): number {
  return 28 + (maximum === minimum ? 0 : (value - minimum) / (maximum - minimum) * (width - 56));
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
