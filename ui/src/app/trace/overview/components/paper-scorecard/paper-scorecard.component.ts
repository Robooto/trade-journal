import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { netTone, signedMoney } from './paper-format';

/** Sessions to the hold-family's first read (docs/studies/hold-family-preregistration-2026-10-17.md). */
export const FIRST_READ_SESSIONS = 20;

/** The live bot next to the four frozen exit rules on the same entries. Paper only. */
@Component({
  selector: 'app-paper-scorecard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-scorecard.component.html',
  styleUrl: './paper-scorecard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperScorecardComponent {
  @Input() card: PaperBacktestScorecard | null = null;
  @Input() error = false;
  readonly firstRead = FIRST_READ_SESSIONS;

  money(value: number | null | undefined): string { return signedMoney(value); }

  tone(value: number | null | undefined): string { return netTone(value); }

  session(policy: BacktestScorecardPolicy, day: string): number | null {
    return policy.summary.session_totals[day] ?? null;
  }

  /** "Bot (live rules)" for the reference, "H1 hold to expiry" for the rest. */
  label(policy: BacktestScorecardPolicy, card: PaperBacktestScorecard): string {
    return policy.id === card.reference_policy ? 'Bot (live rules)' : policy.label;
  }
}
