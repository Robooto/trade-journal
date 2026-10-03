import type { PaperLedgerResponse } from '../../data-access/paper.models';
import type { PaperCatalog } from '../../data-access/generated/research-contracts';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';

@Component({
  selector: 'app-paper-ledger', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './paper-ledger.component.html', styleUrl: './paper-ledger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperLedgerComponent implements OnChanges, OnDestroy {
  @Input() fromDate = '';
  @Input() toDate = '';
  strategy = 'spx-directional-vertical.v1'; policy = ''; width = ''; status = ''; search = ''; offset = 0;
  readonly response = signal<PaperLedgerResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private request?: Subscription;
  private catalogRequest?: Subscription;
  readonly catalog = signal<PaperCatalog | null>(null);
  constructor(private readonly api: TraceApiService) {}
  ngOnChanges(): void {
    this.catalogRequest?.unsubscribe();
    this.request?.unsubscribe();
    this.catalog.set(null);
    this.error.set('');
    this.response.set(null);
    if (!this.toDate) return;
    this.loading.set(true);
    this.catalogRequest = this.api.paperCatalog(this.toDate).subscribe({
      next: catalog => { this.catalog.set(catalog); this.configureLedger(); },
      error: () => { this.loading.set(false); this.error.set('Paper configuration unavailable. No default policy was substituted.'); },
    });
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); this.catalogRequest?.unsubscribe(); }
  get policies() { const catalog = this.catalog(); return catalog?.policies.filter(policy => [catalog.active?.policy_id, catalog.forward_experiment?.id, catalog.distance_shadow.id].includes(policy.id)) ?? []; }
  load(reset = false): void {
    if (!this.fromDate || !this.toDate || !this.policy || !this.catalog()) { this.loading.set(false); return; }
    if (reset) this.offset = 0;
    this.request?.unsubscribe();
    this.response.set(null); this.error.set(''); this.loading.set(true);
    this.request = this.api.paperTrades(this.fromDate, this.toDate, {
      strategy_id: this.strategy, policy_id: this.policy, width_points: this.width,
      active_only: 'true',
      status: this.status, search: this.search, offset: String(this.offset), limit: '50',
    }).subscribe({ next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set('Paper ledger unavailable. No results have been substituted.'); this.loading.set(false); } });
  }
  page(delta: number): void { this.offset = Math.max(0, this.offset + delta); this.load(); }
  configureLedger(): void {
    const catalog = this.catalog();
    if (!catalog) return;
    const trial = catalog.forward_experiment;
    const preferred = trial?.start_date && this.toDate >= trial.start_date ? trial.id : catalog.active?.policy_id;
    this.policy = preferred ?? '';
    this.width = String(catalog.active?.width_points ?? '');
    this.load(true);
  }
  money(value: number | null | undefined): string { return value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
}
