import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import type { NegativePocketReview, NegativePocketTrade } from '../../data-access/generated/research-contracts';
import { TraceApiService } from '../../data-access/trace-api.service';

const PRIMARY = 'control';
const PRIMARY_COST = 12.6;

const READINGS: Record<NegativePocketReview['primary']['interpretation'], string> = {
  insufficient_evidence: 'Not enough evidence yet',
  gamma_gate_not_demonstrably_protecting_pnl: 'The positive-gamma requirement is not clearly protecting P/L',
  gamma_gate_supported: 'The positive-gamma requirement is supported',
};

const VARIANTS: Record<string, string> = {
  'anchored-control': 'Stop from entry debit',
  'anchored-tighter-stop-confirmed': 'Tighter anchored stop, two confirmations',
};

/** Paper-only negative-gamma-pocket shadow. Results never change the active strategy. */
@Component({
  selector: 'app-paper-negative-pocket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-negative-pocket.component.html',
  styleUrl: './paper-negative-pocket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperNegativePocketComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() refreshAt: Date | null = null;
  readonly review = signal<NegativePocketReview | null>(null);
  readonly error = signal(false);
  readonly primary = computed(() => this.review()?.policies.find(p => p.policy_id === PRIMARY && p.cost_per_round_trip_dollars === PRIMARY_COST) ?? null);
  readonly trades = computed(() => [...(this.review()?.trades ?? [])].sort((a, b) => b.signal_ts.localeCompare(a.signal_ts)));
  readonly variants = computed(() => (this.review()?.policies ?? []).filter(p => p.policy_id !== PRIMARY && p.cost_per_round_trip_dollars === PRIMARY_COST));
  readonly reading = computed(() => { const r = this.review(); return r ? READINGS[r.primary.interpretation] : ''; });
  private request?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.error.set(false);
    if (!this.date) { this.review.set(null); return; }
    this.request = this.api.paperNegativePocket(this.date).subscribe({
      next: value => this.review.set(value),
      error: () => { this.review.set(null); this.error.set(true); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const sign = value < 0 ? '−' : value > 0 ? '+' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  }

  dollars(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `$${value.toFixed(2)}`;
  }

  distance(band: string | null | undefined): string {
    const match = band?.match(/_(\d+)_(\d+|plus)$/);
    return !match ? this.label(band) : match[2] === 'plus' ? `${match[1]}+ pts` : `${match[1]}–${match[2]} pts`;
  }

  label(value: string | null | undefined): string {
    return value ? value.replaceAll('_', ' ') : '—';
  }

  side(trade: NegativePocketTrade): string {
    return trade.trade_type === 'bull_put_credit' ? 'Bull put' : 'Bear call';
  }

  time(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
    }).format(parsed);
  }

  outcome(trade: NegativePocketTrade): string {
    if (trade.entry_status === 'unavailable') return `Not entered · ${this.label(trade.entry_reason)}`;
    if (trade.status === 'open') return 'Open';
    if (trade.status === 'skipped') return 'Skipped · below credit floor';
    if (trade.status === 'unevaluable') return `Unknown · ${this.label(trade.exit_reason)}`;
    return `${this.label(trade.exit_reason)} ${this.time(trade.exit_at)}`;
  }

  gamma(trade: NegativePocketTrade, value: string | null | undefined): string {
    if (trade.gex_context_status === 'unavailable') return 'after 13:20';
    if (trade.gex_context_status === 'missing_profile') return 'unavailable';
    return value === 'positive' ? 'dealers long' : value === 'negative' ? 'dealers short' : value === 'flat' ? 'flat' : '—';
  }

  variantLabel(policyId: string): string {
    return VARIANTS[policyId] ?? this.label(policyId);
  }

  splitLabel(split: string): string {
    return split === 'strike_gex=positive' ? 'Dealers long 0DTE gamma at the short strike'
      : split === 'path_gex_all_expiry=negative' ? 'Dealers short all-expiry gamma between spot and strike'
      : this.label(split);
  }

  sampleSummary(review: NegativePocketReview): string {
    const counts = review.sample_statuses;
    const failures = (counts['request_failed'] ?? 0) + (counts['backoff'] ?? 0);
    const problems = (counts['authentication_blocked'] ?? 0) + (counts['failure_limit_reached'] ?? 0)
      + (counts['late_start'] ?? 0) + (counts['late_response'] ?? 0);
    return `${counts['received'] ?? 0} quote minutes received · ${failures} retry minutes · ${problems} blocked or late`;
  }
}
