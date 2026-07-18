import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { FlowSymbolHistoryResponse } from '../../flow-ideas.models';

@Component({
  selector: 'app-report-history',
  templateUrl: './report-history.component.html',
  styleUrls: ['./report-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ReportHistoryComponent {
  @Input() history: FlowSymbolHistoryResponse | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;

  formatPriority(value: number | null): string {
    return value == null ? '-' : String(Math.round(value));
  }

  formatPercentile(value: number | null | undefined): string {
    return value == null ? '-' : String(Math.round(value));
  }
}
