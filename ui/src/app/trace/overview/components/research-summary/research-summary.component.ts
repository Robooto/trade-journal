import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { TraceResearchStatusResponse, TraceStudyStatus } from '../../trace.models';

type Tier = 'supported' | 'replicating' | 'diagnostic';

const GROUPS: readonly { tier: Tier; title: string; hint: string }[] = [
  { tier: 'supported', title: 'Supported', hint: 'Held up over 100+ sessions. Use as context, not a trade trigger.' },
  { tier: 'replicating', title: 'Being re-tested', hint: 'Locked tests still collecting independent evidence. Do not act on these yet.' },
  { tier: 'diagnostic', title: 'Diagnostics', hint: 'Descriptive reports and paper results that support reviews.' },
];

/** Plain-language summary of what the TRACE research supports, is re-testing, and has retired. */
@Component({
  selector: 'app-research-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './research-summary.component.html',
  styleUrl: './research-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchSummaryComponent {
  @Input({ required: true }) status!: TraceResearchStatusResponse;
  /** Open by default on the Research tab. */
  @Input() open = false;
  readonly groups = GROUPS;

  studies(tier: Tier): readonly TraceStudyStatus[] {
    return this.status.studies.filter(study => study.evidence_tier === tier);
  }

  primaryLine(study: TraceStudyStatus): string | null {
    const test = (study.primary_tests ?? []).find(row => row.scope === 'cumulative' && row.role === 'primary')
      ?? (study.primary_tests ?? []).find(row => row.scope === 'cumulative');
    if (!test || test.effect === null) return null;
    const unit = test.unit === 'pp' ? ' pts' : ' SPX pts';
    const fmt = (value: number | null) => value === null ? '?' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
    return `Latest locked test: ${fmt(test.effect)}${unit} [${fmt(test.interval_low)}, ${fmt(test.interval_high)}] · ${test.observations} observations · ${test.sessions} days · ${test.validation_status.replaceAll('_', ' ')}`;
  }
}
