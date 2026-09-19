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
  path: { ts: string; spot: number | null; quote_status: string; prices: unknown }[];
}
export interface PaperLedgerResponse {
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
  strategy = ''; policy = 'baseline-one-position.v1'; width = ''; status = ''; search = ''; offset = 0;
  private policyInitialized = false;
  readonly response = signal<PaperLedgerResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private request?: Subscription;
  constructor(private readonly api: TraceApiService) {}
  ngOnChanges(): void {
    if (!this.policyInitialized && this.toDate) {
      this.policy = this.toDate >= '2026-09-21' ? 'credit-risk-to-close.v2' : 'baseline-one-position.v1';
      this.policyInitialized = true;
    }
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
      status: this.status, search: this.search, offset: String(this.offset), limit: '50',
    }).subscribe({ next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set('Paper ledger unavailable. No results have been substituted.'); this.loading.set(false); } });
  }
  page(delta: number): void { this.offset = Math.max(0, this.offset + delta); this.load(); }
  money(value: number | null | undefined): string { return value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
}
