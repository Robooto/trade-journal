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

  priorityTone(value: number | null): string {
    if (value == null) return 'priority-unscored';
    if (value >= 70) return 'priority-high';
    if (value >= 50) return 'priority-medium';
    return 'priority-low';
  }

  priorityLabel(value: number | null): string {
    if (value == null) return 'unscored';
    if (value >= 70) return 'high';
    if (value >= 50) return 'notable';
    return 'monitor';
  }

  percentileTone(value: number | null | undefined): string {
    if (value == null) return 'percentile-muted';
    if (value >= 90) return 'percentile-upper';
    if (value <= 10) return 'percentile-lower';
    return 'percentile-mid';
  }

  reasonTone(reason: string): string {
    if (reason.includes('unusual')) return 'tag-unusual';
    if (reason.includes('spread')) return 'tag-spread';
    if (reason.includes('premium')) return 'tag-premium';
    if (reason.includes('warning') || reason.includes('noise')) return 'tag-warning';
    return '';
  }

  eventTone(event: string | null): string {
    return event ? 'event-' + event.toLowerCase().replaceAll('_', '-') : 'event-watching';
  }

  signedTone(value: number | null | undefined): string {
    if (value == null || value === 0) return '';
    return value > 0 ? 'positive' : 'negative';
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
