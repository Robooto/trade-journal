import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import {
  FlowHistoryRow,
  FlowSymbolHistoryResponse,
} from '../../flow-ideas.models';

@Component({
  selector: 'app-report-history',
  templateUrl: './report-history.component.html',
  styleUrls: ['./report-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ReportHistoryComponent {
  private readonly pageSize = 5;
  private historyValue: FlowSymbolHistoryResponse | null = null;
  visibleCount = this.pageSize;

  @Input()
  set history(value: FlowSymbolHistoryResponse | null) {
    if (value !== this.historyValue) {
      this.visibleCount = this.pageSize;
    }
    this.historyValue = value;
  }

  get history(): FlowSymbolHistoryResponse | null {
    return this.historyValue;
  }

  @Input() loading = false;
  @Input() error: string | null = null;

  get visibleRows(): readonly FlowHistoryRow[] {
    const rows = this.historyValue?.rows ?? [];
    return rows.slice(Math.max(0, rows.length - this.visibleCount));
  }

  get hasMoreHistory(): boolean {
    return (this.historyValue?.rows.length ?? 0) > this.visibleCount;
  }

  get remainingHistoryCount(): number {
    return Math.max(
      0,
      (this.historyValue?.rows.length ?? 0) - this.visibleCount,
    );
  }

  loadMore(): void {
    const rowCount = this.historyValue?.rows.length ?? 0;
    this.visibleCount = Math.min(
      rowCount,
      this.visibleCount + this.pageSize,
    );
  }

  formatPriority(value: number | null): string {
    return value == null ? '-' : String(Math.round(value));
  }

  formatPercentile(value: number | null | undefined): string {
    return value == null ? '-' : String(Math.round(value));
  }
}
