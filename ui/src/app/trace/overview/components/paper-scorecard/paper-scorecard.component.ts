import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { TraceApiService } from '../../data-access/trace-api.service';

/** The live baseline rules next to the frozen hold-family arms on the same entries. Paper only. */
@Component({
  selector: 'app-paper-scorecard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-scorecard.component.html',
  styleUrl: './paper-scorecard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperScorecardComponent implements OnChanges, OnDestroy {
  @Input() refreshAt: Date | null = null;
  readonly scorecard = signal<PaperBacktestScorecard | null>(null);
  readonly error = signal(false);
  private request?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.error.set(false);
    this.request = this.api.paperBacktestScorecard().subscribe({
      next: value => this.scorecard.set(value),
      error: () => { this.scorecard.set(null); this.error.set(true); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const rounded = Math.round(value);
    return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
  }

  tone(value: number | null | undefined): string {
    return value === null || value === undefined || Math.round(value) === 0 ? 'flat' : value < 0 ? 'loss' : 'gain';
  }

  session(policy: BacktestScorecardPolicy, day: string): number | null {
    return policy.summary.session_totals[day] ?? null;
  }
}
