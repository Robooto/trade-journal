import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { TraceDashboardRow } from '../../trace.models';

@Component({
  selector: 'app-trace-capture-history',
  templateUrl: './capture-history.component.html',
  styleUrls: ['./capture-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class CaptureHistoryComponent {
  @Input() rows: readonly TraceDashboardRow[] = [];
  @Input() activeIndex = 0;
  @Output() readonly captureSelected = new EventEmitter<number>();

  selectCapture(index: number): void {
    this.captureSelected.emit(index);
  }

  formatTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(parsed);
  }

  formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
    if (value == null || !Number.isFinite(value)) return '\u2014';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
  }

  formatCompact(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '\u2014';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '\u2212' : '';
    if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return this.formatNumber(value);
  }

  formatLabel(value: string | null | undefined): string {
    if (!value) return '\u2014';
    return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  valueTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
    if (value == null || value === 0) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }
}