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
  readonly shadow = signal<PaperLedgerResponse | null>(null);
  readonly shadowError = signal(false);
  private shadowRequest?: Subscription;
  private request?: Subscription;
  private comparisonRequest?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  get cohortStart(): string { return this.date >= '2026-09-22' ? '2026-09-22' : '2026-09-21'; }
  get policyId(): string { return this.date >= '2026-09-22' ? 'credit-risk-to-close.v4' : 'credit-risk-to-close.v3'; }

  ngOnChanges(): void {
    this.shadowRequest?.unsubscribe();
    this.shadow.set(null);
    this.shadowError.set(false);
    this.loading.set(false);
    this.request?.unsubscribe();
    this.comparisonRequest?.unsubscribe();
    this.comparison.set(null);
    this.comparisonError.set(false);
    this.response.set(null);
    this.error.set(false);
    if (!this.date || this.date < '2026-09-21') return;
    this.loading.set(true);
    this.request = this.api.paperTrades(this.date, this.date, {
      policy_id: this.policyId,
      offset: '0', limit: '200',
      width_points: '10', active_only: 'true',
    }).subscribe({
      next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
    if (this.date >= '2026-09-28') {
      this.shadowRequest = this.api.paperTrades('2026-09-28', this.date, {
        policy_id: 'structure-distance-shadow.v1', strategy_id: 'spx-directional-vertical.v1',
        width_points: '10', active_only: 'true', limit: '1',
      }).subscribe({
        next: response => this.shadow.set(response),
        error: () => this.shadowError.set(true),
      });
    }
    this.comparisonRequest = this.api.paperTrades(this.cohortStart, this.date, {
      policy_id: this.policyId, width_points: '10', active_only: 'true', limit: '1',
    }).subscribe({
      next: response => this.comparison.set(response),
      error: () => this.comparisonError.set(true),
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); this.comparisonRequest?.unsubscribe(); this.shadowRequest?.unsubscribe(); }

  money(value: number | null | undefined): string {
    return value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  trades(strategyId: string): PaperLedgerRow[] {
    return (this.response()?.rows || []).filter(row => row.strategy_id === strategyId && row.entry_status === 'recorded');
  }

  skipped(strategyId: string): number {
    return (this.response()?.rows || []).filter(row => row.strategy_id === strategyId && row.status === 'skipped').length;
  }
}
