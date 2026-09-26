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
  strategy_summaries?: { strategy_id: string; label: string; summary: {
    closed: number; open: number; skipped: number; unevaluable: number; closed_sessions: number;
    gross_pnl_dollars: number | null; cost_scenario_pnl_dollars: number | null;
    mean_return_on_max_risk: number | null; realized_closed_drawdown_dollars: number | null;
    entry_coverage: number | null;
  } }[];
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
  strategy = ''; policy = 'credit-risk-to-close.v4'; width = '10'; status = ''; search = ''; offset = 0;
  includeArchived = false;
  readonly response = signal<PaperLedgerResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private request?: Subscription;
  constructor(private readonly api: TraceApiService) {}
  ngOnChanges(): void {
    if (!this.includeArchived) this.policy = this.toDate >= '2026-09-22' ? 'credit-risk-to-close.v4' : 'credit-risk-to-close.v3';
    this.load(true);
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
  load(reset = false): void {
    if (!this.fromDate || !this.toDate) return;
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
    this.policy = this.includeArchived ? 'baseline-one-position.v1' : (this.toDate >= '2026-09-22' ? 'credit-risk-to-close.v4' : 'credit-risk-to-close.v3');
    this.width = this.includeArchived ? '' : '10';
    this.load(true);
  }
  money(value: number | null | undefined): string { return value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
}
