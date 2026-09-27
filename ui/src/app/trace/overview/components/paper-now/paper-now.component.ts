import type { PaperCatalog } from '../../data-access/generated/research-contracts';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { PaperLedgerResponse, PaperLedgerRow } from '../../data-access/paper.models';

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
  readonly catalog = signal<PaperCatalog | null>(null);
  readonly catalogError = signal(false);
  private catalogRequest?: Subscription;
  private shadowRequest?: Subscription;
  private request?: Subscription;
  private comparisonRequest?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  get cohortStart(): string { return this.catalog()?.active?.start_date ?? ''; }
  get policyId(): string { return this.catalog()?.active?.policy_id ?? ''; }

  ngOnChanges(): void {
    this.catalogRequest?.unsubscribe();
    this.catalog.set(null);
    this.catalogError.set(false);
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
    if (!this.date) return;
    this.loading.set(true);
    this.catalogRequest = this.api.paperCatalog(this.date).subscribe({
      next: catalog => { this.catalog.set(catalog); this.loadEvidence(); },
      error: () => { this.catalogError.set(true); this.loading.set(false); },
    });
  }

  private loadEvidence(): void {
    const catalog = this.catalog();
    if (!catalog?.active) { this.loading.set(false); return; }
    const width = String(catalog.active.width_points);
    this.request = this.api.paperTrades(this.date, this.date, {
      policy_id: this.policyId,
      offset: '0', limit: '200',
      width_points: width, active_only: 'true',
    }).subscribe({
      next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
    if (catalog.distance_shadow.start_date && this.date >= catalog.distance_shadow.start_date) {
      this.shadowRequest = this.api.paperTrades(catalog.distance_shadow.start_date, this.date, {
        policy_id: catalog.distance_shadow.id, strategy_id: 'spx-directional-vertical.v1',
        width_points: width, active_only: 'true', limit: '1',
      }).subscribe({
        next: response => this.shadow.set(response),
        error: () => this.shadowError.set(true),
      });
    }
    this.comparisonRequest = this.api.paperTrades(this.cohortStart, this.date, {
      policy_id: this.policyId, width_points: width, active_only: 'true', limit: '1',
    }).subscribe({
      next: response => this.comparison.set(response),
      error: () => this.comparisonError.set(true),
    });
  }

  ngOnDestroy(): void { this.catalogRequest?.unsubscribe(); this.request?.unsubscribe(); this.comparisonRequest?.unsubscribe(); this.shadowRequest?.unsubscribe(); }

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
