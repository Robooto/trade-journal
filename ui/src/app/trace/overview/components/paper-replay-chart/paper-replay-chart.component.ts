import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TracePaperReplayResponse } from '../../trace.models';

/** Rendering only: recorded gaps and timestamps are preserved; no data is fetched. */
@Component({
  selector: 'app-paper-replay-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-replay-chart.component.html',
  styleUrl: './paper-replay-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperReplayChartComponent {
  @Input({ required: true }) replay!: TracePaperReplayResponse;

  replaySegments(): string[] {
    const points = this.replay?.path ?? [];
    const spots = points.map(point => point.spot).filter((spot): spot is number => spot !== null && Number.isFinite(spot));
    if (spots.length < 2) return [];
    const segments: string[] = []; let current: string[] = [];
    points.forEach((point, index) => {
      if (point.gap || point.spot === null) {
        if (current.length > 0) segments.push(current.join(' '));
        current = [];
        if (point.spot === null) return;
      }
      current.push(`${this.replayXAt(index, points.length)},${this.replayY(point.spot, spots)}`);
    });
    if (current.length > 0) segments.push(current.join(' '));
    return segments;
  }

  replayY(value: number, spots?: number[]): number {
    const values = spots ?? (this.replay?.path.map(point => point.spot).filter((spot): spot is number => spot !== null && Number.isFinite(spot)) ?? []);
    const levels = this.replay?.levels.map(level => level.price).filter((price): price is number => price !== null && Number.isFinite(price)) ?? [];
    const low = Math.min(...values, ...levels); const high = Math.max(...values, ...levels); const span = high - low || 1;
    return 88 - ((value - low) / span) * 76;
  }

  replayLevelY(value: number): number {
    return this.replayY(value);
  }

  replayX(captureId: string): number {
    const points = this.replay?.path ?? [];
    const index = points.findIndex(point => point.capture_id === captureId);
    return index < 0 ? 0 : this.replayXAt(index, points.length);
  }

  replaySpot(captureId: string): number | null {
    return this.replay?.path.find(point => point.capture_id === captureId)?.spot ?? null;
  }

  replaySpotY(captureId: string): number {
    const spot = this.replaySpot(captureId);
    return spot === null ? 88 : this.replayY(spot);
  }

  replayXAt(index: number, count: number): number {
    const points = this.replay?.path ?? [];
    const first = points.length ? Date.parse(points[0].ts) : NaN;
    const last = points.length ? Date.parse(points[points.length - 1].ts) : NaN;
    const current = points[index] ? Date.parse(points[index].ts) : NaN;
    if (Number.isFinite(first) && Number.isFinite(last) && Number.isFinite(current) && last > first) {
      return 8 + ((current - first) / (last - first)) * 90;
    }
    return 8 + (index / Math.max(1, count - 1)) * 90;
  }

  replayPriceTicks(): number[] {
    const replay = this.replay;
    const values = [...(replay?.path.map(point => point.spot).filter((spot): spot is number => spot !== null && Number.isFinite(spot)) ?? []), ...(replay?.levels.map(level => level.price).filter((price): price is number => price !== null && Number.isFinite(price)) ?? [])];
    if (!values.length) return [];
    const low = Math.min(...values); const high = Math.max(...values); const step = (high - low || 1) / 2;
    return [high, high - step, low];
  }

  replayTimeTicks(): { x: number; label: string }[] {
    const points = this.replay?.path ?? [];
    if (!points.length) return [];
    return [0, Math.floor((points.length - 1) / 2), points.length - 1].map(index => ({
      x: this.replayXAt(index, points.length), label: this.formatReplayTime(points[index].ts),
    }));
  }

  formatReplayTime(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value.slice(11, 16) : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
  }

  replayHasGaps(): boolean {
    return Boolean(this.replay?.path.some(point => point.gap));
  }

}
