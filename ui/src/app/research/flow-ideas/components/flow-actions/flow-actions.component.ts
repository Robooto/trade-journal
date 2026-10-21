import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FlowActionSummary } from '../../flow-ideas.models';

@Component({
  selector: 'app-flow-actions',
  templateUrl: './flow-actions.component.html',
  styleUrls: ['./flow-actions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowActionsComponent {
  @Input() summary: FlowActionSummary | null | undefined = null;
  @Input() compact = false;

  readonly closingHint =
    'At least 80% of this flow is closing. In past reports most closing-heavy flow took profit on a move that '
    + 'already paid, with no reliable reversal afterwards.';

  get closingLabel(): string | null {
    return closingContextLabel(this.summary);
  }
}

export function closingContextLabel(summary: FlowActionSummary | null | undefined): string | null {
  const context = summary?.closing_context;
  if (!context) return null;
  if (context === 'mixed_bets') return 'Closing mixed bets';
  const bet = summary?.closed_bet;
  if (context === 'move_unavailable') return `Closing ${bet} bets · past move not in report`;
  const move = summary?.prior_return_5d ?? 0;
  const signed = `${move > 0 ? '+' : ''}${(move * 100).toFixed(1)}%`;
  return `Closing ${context} ${bet} bets · ${signed} past 5d`;
}
