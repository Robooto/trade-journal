import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperLedgerResponse, PaperLedgerRow } from '../paper-ledger/paper-ledger.component';

@Component({
  selector: 'app-paper-now',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-now.component.html',
  styleUrl: './paper-now.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperNowComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() refreshAt: Date | null = null;
  readonly response = signal<PaperLedgerResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly comparison = signal<PaperLedgerResponse | null>(null);
  readonly comparisonError = signal(false);
  private request?: Subscription;
  private comparisonRequest?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.comparisonRequest?.unsubscribe();
    this.comparison.set(null);
    this.comparisonError.set(false);
    this.response.set(null);
    this.error.set(false);
    if (!this.date || this.date < '2026-09-21') return;
    this.loading.set(true);
    this.request = this.api.paperTrades(this.date, this.date, {
      policy_id: this.date >= '2026-09-21' ? 'credit-risk-to-close.v2' : 'baseline-one-position.v1',
      status: 'open', offset: '0', limit: '6',
      width_points: '10', active_only: 'true',
    }).subscribe({
      next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
    this.comparisonRequest = this.api.paperTrades('2026-09-21', this.date, {
      policy_id: 'credit-risk-to-close.v2', width_points: '10', active_only: 'true', limit: '1',
    }).subscribe({
      next: response => this.comparison.set(response),
      error: () => this.comparisonError.set(true),
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); this.comparisonRequest?.unsubscribe(); }

  strategyLabel(row: PaperLedgerRow): string {
    return row.strategy_id === 'spx-structure-iron-condor.v1' ? 'Structure iron condor' : 'Directional vertical';
  }
}
