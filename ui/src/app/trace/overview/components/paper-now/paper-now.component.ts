import type { PaperCatalog } from '../../data-access/generated/research-contracts';
import { PaperScorecardComponent } from '../paper-scorecard/paper-scorecard.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { PaperLedgerResponse, PaperLedgerRow } from '../../data-access/paper.models';

@Component({
  selector: 'app-paper-now',
  standalone: true,
  imports: [CommonModule, PaperScorecardComponent],
  templateUrl: './paper-now.component.html',
  styleUrl: './paper-now.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperNowComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() captureTs = '';
  @Input() refreshAt: Date | null = null;
  readonly decision = signal<import('../decision-journal/decision-journal.models').Spx0DteDecisionJournalResponse | null>(null);
  readonly decisionLoading = signal(false);
  readonly decisionError = signal(false);
  private decisionRequest?: Subscription;
  readonly response = signal<PaperLedgerResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  /** Results for the live bot since its cohort started (one row; summaries only). */
  readonly results = signal<PaperLedgerResponse | null>(null);
  readonly resultsError = signal(false);
  readonly catalog = signal<PaperCatalog | null>(null);
  readonly catalogError = signal(false);
  private catalogRequest?: Subscription;
  private request?: Subscription;
  private resultsRequest?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.decisionRequest?.unsubscribe(); this.decision.set(null); this.decisionError.set(false); this.decisionLoading.set(false);
    if (this.date && this.captureTs) {
      this.decisionLoading.set(true);
      this.decisionRequest = this.api.decisionJournal(this.date, this.captureTs).subscribe({
        next: value => { this.decision.set(value); this.decisionLoading.set(false); },
        error: () => { this.decisionError.set(true); this.decisionLoading.set(false); },
      });
    }
    this.catalogRequest?.unsubscribe(); this.request?.unsubscribe(); this.resultsRequest?.unsubscribe();
    this.catalog.set(null); this.catalogError.set(false);
    this.response.set(null); this.error.set(false); this.loading.set(false);
    this.results.set(null); this.resultsError.set(false);
    if (!this.date) return;
    this.loading.set(true);
    this.catalogRequest = this.api.paperCatalog(this.date).subscribe({
      next: catalog => { this.catalog.set(catalog); this.loadEvidence(); },
      error: () => { this.catalogError.set(true); this.loading.set(false); },
    });
  }

  private loadEvidence(): void {
    const active = this.catalog()?.active;
    if (!active) { this.loading.set(false); return; }
    const filters = { policy_id: active.policy_id, strategy_id: 'spx-directional-vertical.v1', width_points: String(active.width_points), active_only: 'true' };
    this.request = this.api.paperTrades(this.date, this.date, { ...filters, offset: '0', limit: '200' }).subscribe({
      next: response => { this.response.set(response); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
    this.resultsRequest = this.api.paperTrades(active.start_date, this.date, { ...filters, limit: '1' }).subscribe({
      next: response => this.results.set(response),
      error: () => this.resultsError.set(true),
    });
  }

  ngOnDestroy(): void { this.decisionRequest?.unsubscribe(); this.catalogRequest?.unsubscribe(); this.request?.unsubscribe(); this.resultsRequest?.unsubscribe(); }

  /** The live bot's summary since its cohort start, from the ledger's strategy summaries. */
  get summary() {
    return this.results()?.strategy_summaries?.find(item => item.strategy_id === 'spx-directional-vertical.v1')?.summary ?? null;
  }

  time(value: string | null | undefined): string {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
    }).format(date);
  }

  money(value: number | null | undefined): string {
    return value == null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  get currentSession(): PaperLedgerResponse | null { return this.response(); }

  get sessionUnavailable(): boolean { return this.error() || this.response()?.status === 'unavailable'; }

  get sessionCoverage() {
    return this.currentSession?.session_coverage?.find(day => day.date === this.date) ?? null;
  }

  coverageLabel(value: string): string {
    const labels: Record<string, string> = {
      complete: 'Complete', in_progress: 'Session in progress', incomplete: 'Incomplete',
      excluded: 'Excluded from primary results', scheduled: 'Session not started', no_evidence: 'No paper cycles recorded',
      no_paper_cycles: 'No paper cycles recorded', missing_open_capture: 'Opening paper capture missing',
      missing_close_capture: 'Closing paper capture missing', capture_gap: 'Gap exceeds 12 minutes',
      non_increasing_capture_clock: 'Capture timestamps are inconsistent', future_capture: 'Capture timestamp is in the future',
      source_definition_mismatch: 'Paper source definitions do not match', decision_unavailable: 'Entry decision data missing',
      paper_source_stale: 'Latest paper cycle is over 12 minutes old', entry_onsets_unreconciled: 'Signal onset records do not reconcile',
      outcome_unevaluable: 'One or more trade paths cannot be evaluated', outcome_still_open: 'Exit outcome missing after close',
      position_state_unknown: 'Earlier position state is unknown',
    };
    return labels[value] ?? value.replaceAll('_', ' ');
  }

  sessionTrades(status: string): PaperLedgerRow[] {
    return (this.currentSession?.rows || []).filter(row => row.strategy_id === 'spx-directional-vertical.v1' && row.status === status);
  }

  label(reason: string): string {
    const labels: Record<string, string> = {
      bull_put_credit: 'Bull put spread', bear_call_credit: 'Bear call spread',
      profit_target: 'Profit target reached', two_times_entry_credit_stop: 'Stop reached',
      forced_exit_close: 'Closed at market close', fragile_structure_distance: 'Too close to the frozen structure',
      position_occupied_or_same_capture_exit: 'Position already open or just closed',
      position_state_unknown: 'Earlier position could not be evaluated', entry_credit_below_minimum: 'Credit below minimum',
      missing_path_quote: 'Quote missing along the trade path', capture_gap: 'Gap in captured data',
      awaiting_exit: 'Waiting for target, stop or market close',
    };
    return labels[reason] ?? reason.replaceAll('_', ' ');
  }
}
