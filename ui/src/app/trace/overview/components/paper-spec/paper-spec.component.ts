import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { netTone, signedMoney } from '../paper-scorecard/paper-format';

/** Sessions to the spec's first read (pipeline docs/studies/strategy-spec-v1-preregistration-2026-10-21.md). */
export const SPEC_FIRST_READ_SESSIONS = 20;

/** Bot strategy spec v1 (docs/studies/strategy-spec-v1-preregistration-2026-10-21.md in the pipeline):
 * each entry filter next to the same exits without it. Paper only. */
@Component({
  selector: 'app-paper-spec',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-spec.component.html',
  styleUrls: ['../paper-scorecard/paper-scorecard.component.scss', './paper-spec.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperSpecComponent {
  @Input() card: PaperBacktestScorecard | null = null;
  @Input() error = false;
  readonly firstRead = SPEC_FIRST_READ_SESSIONS;

  money(value: number | null | undefined): string { return signedMoney(value); }
  tone(value: number | null | undefined): string { return netTone(value); }

  session(policy: BacktestScorecardPolicy, day: string): number | null {
    return policy.summary.session_totals[day] ?? null;
  }

  label(policy: BacktestScorecardPolicy, card: PaperBacktestScorecard): string {
    return policy.id === card.reference_policy ? 'Bot (live rules)' : policy.label;
  }

  /** "bot" for the reference, else the control's label up to its colon ("Hold-exit control"). */
  controlName(policy: BacktestScorecardPolicy, card: PaperBacktestScorecard): string {
    if (!policy.compared_to) return '';
    if (policy.compared_to === card.reference_policy) return 'bot';
    const control = card.policies.find(item => item.id === policy.compared_to);
    return (control?.label ?? policy.compared_to).split(':')[0];
  }
}
