import type { PaperCatalog, DistanceShadow, StrategySummary } from '../../data-access/generated/research-contracts';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';

export interface PaperLeg {
  symbol: string; side: string; option_type: string; strike: number; expiration: string; quantity: number;
  entry_quote: { bid: number; ask: number; quoted_at: string } | null;
  exit_quote: { bid: number; ask: number; quoted_at: string } | null;
}
export interface PaperLedgerRow {
  evaluation_id: string; strategy_id: string; date: string; onset_ts: string; trade_type: string;
  status: string; reason: string; entry_status: string; width_points: number; legs: PaperLeg[];
  protocol_sha256: string; timing_policy: string; entry_credit_dollars: number | null;
  exit_debit_dollars: number | null; gross_pnl_dollars: number | null; max_risk_dollars: number | null;
  exit_ts: string | null; frozen_structure: unknown; structures: unknown;
  cost_scenarios?: { label: string; net_scenario_dollars: number }[];
  distance_filter?: string;
  excluded_baseline_outcome?: { status: string; reason: string; gross_pnl_dollars: number | null };
  path: { ts: string; spot: number | null; quote_status: string; prices: unknown }[];
}
export interface PaperLedgerResponse {
  distance_shadow?: DistanceShadow | null;
  strategy_summaries?: readonly StrategySummary[];
  status: string; total: number; rows: PaperLedgerRow[]; sessions: string[];
  cohorts: { strategy_id: string; policy_id: string; width_points: number; protocol_sha256: string;
    summary: { closed: number; open: number; skipped: number; unevaluable: number; gross_pnl_dollars: number | null } }[];
}

@Component({
  selector: 'app-paper-ledger', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './paper-ledger.component.html', styleUrl: './paper-ledger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperLedgerComponent implements OnChanges, OnDestroy {
  @Input() fromDate = '';
  @Input() toDate = '';
  strategy = ''; policy = ''; width = ''; status = ''; search = ''; offset = 0;
  includeArchived = false;
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
      next: catalog => { this.catalog.set(catalog); this.archiveChanged(); },
      error: () => { this.loading.set(false); this.error.set('Paper configuration unavailable. No default policy was substituted.'); },
    });
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); this.catalogRequest?.unsubscribe(); }
  get policies() { return this.catalog()?.policies.filter(policy => this.includeArchived ? policy.kind !== 'shadow' : policy.kind !== 'archive') ?? []; }
  load(reset = false): void {
    if (!this.fromDate || !this.toDate || !this.policy || !this.catalog()) { this.loading.set(false); return; }
    if (reset) this.offset = 0;
    this.request?.unsubscribe();
    this.response.set(null); this.error.set(''); this.loading.set(true);
    this.request = this.api.paperTrades(this.fromDate, this.toDate, {
      strategy_id: this.strategy, policy_id: this.policy, width_points: this.width,
      active_only: String(!this.includeArchived),
      status: this.status, search: this.search, offset: String(this.offset), limit: '50',
    }).subscribe({ next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set('Paper ledger unavailable. No results have been substituted.'); this.loading.set(false); } });
  }
  page(delta: number): void { this.offset = Math.max(0, this.offset + delta); this.load(); }
  archiveChanged(): void {
    const catalog = this.catalog();
    if (!catalog) return;
    this.policy = this.includeArchived ? catalog.archive_default_policy_id : catalog.active?.policy_id ?? '';
    this.width = this.includeArchived ? '' : String(catalog.active?.width_points ?? '');
    this.load(true);
  }
  money(value: number | null | undefined): string { return value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
}
