import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { FlowCandidate, FlowReportStatus } from '../../flow-ideas.models';

@Component({
  selector: 'app-flow-candidate-list',
  templateUrl: './candidate-list.component.html',
  styleUrls: ['./candidate-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class CandidateListComponent {
  @Input() candidates: readonly FlowCandidate[] = [];
  @Input() total: number | null = null;
  @Input() loading = false;
  @Input() hasResponse = false;
  @Input() reportStatus: FlowReportStatus | null = null;
  @Input() selectedSymbol: string | null = null;

  @Output() readonly candidateSelected = new EventEmitter<FlowCandidate>();

  trackCandidate(_: number, candidate: FlowCandidate): string {
    return candidate.symbol;
  }

  formatPriority(value: number | null): string {
    return value == null ? '-' : String(Math.round(value));
  }

  formatPercentile(value: number | null | undefined): string {
    return value == null ? '-' : String(Math.round(value));
  }

  formatMoney(value: number | null | undefined): string {
    return value == null ? 'Mark -' : '$' + value.toFixed(2);
  }

  formatNumber(value: number | null | undefined): string {
    return value == null ? '-' : value.toFixed(1);
  }

  formatSigned(value: number | null | undefined, suffix: string): string {
    if (value == null) return '-';
    return (value > 0 ? '+' : '') + value.toFixed(1) + suffix;
  }
}
