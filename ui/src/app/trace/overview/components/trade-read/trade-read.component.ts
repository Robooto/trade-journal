import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, SimpleChanges, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { TraceHistogramRow, TraceResearchStatusResponse } from '../../trace.models';
import type { Spx0DteDecisionJournalResponse } from '../decision-journal/decision-journal.models';

/** Same eligibility as the locked negative-GEX breach test. */
const ACTIVE_NODE_STATES = new Set(['STABLE', 'STRENGTHENING', 'WEAKENING', 'MIGRATING']);
const MIN_NODE_SHARE = 0.05;
/** Decision bands are named by the bot; the distance study names the 0–3 band differently. */
const STUDY_BAND: Record<string, string> = { fragile_0_3: 'near_0_3' };
const BAND_LABEL: Record<string, string> = {
  fragile_0_3: '0–3 band', near_0_3: '0–3 band', near_3_5: '3–5 band', mid_5_10: '5–10 band', far_10_20: '10–20 band', wide_20_plus: '20+ band',
};
const GATE_LABEL: Record<string, string> = {
  positive_gamma: 'gamma pocket is not positive',
  one_directional_hiro_thesis: 'HIRO does not point one way',
  prior_capture_structure_confirmed: 'structure not confirmed on the prior capture',
  complete_current_and_prior_capture: 'capture data incomplete',
  inside_decision_window: 'outside the entry window',
};

export interface BandEvidence { readonly rate: string; readonly signals: string; }

/** One-glance read of the selected capture: the bot's decision and the evidence that supports or weakens it. */
@Component({
  selector: 'app-trade-read',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trade-read.component.html',
  styleUrl: './trade-read.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeReadComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() captureTs: string | null = null;
  @Input() spot: number | null = null;
  @Input() nodes: readonly TraceHistogramRow[] = [];
  @Input() captureId: string | null = null;
  @Input() researchStatus: TraceResearchStatusResponse | null = null;

  readonly decision = signal<Spx0DteDecisionJournalResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  private readonly inputs = signal<{ spot: number | null; nodes: readonly TraceHistogramRow[]; captureId: string | null }>(
    { spot: null, nodes: [], captureId: null });
  private request?: Subscription;

  readonly shortStrike = computed(() => {
    const structure = this.decision()?.frozen_structure;
    const type = this.decision()?.trade_type;
    if (!structure || !type) return null;
    return type === 'bull_put_credit'
      ? Math.floor((structure.level - 5) / 5) * 5
      : Math.ceil((structure.level + 5) / 5) * 5;
  });

  /** Negative nodes strictly between spot and the likely short strike, largest share first. */
  readonly negativeNodesInPath = computed(() => {
    const { spot, nodes, captureId } = this.inputs();
    const strike = this.shortStrike();
    if (spot === null || strike === null) return [];
    const low = Math.min(spot, strike), high = Math.max(spot, strike);
    return nodes
      .filter(node => node.capture_id === captureId && node.gamma_sign === 'negative'
        && ACTIVE_NODE_STATES.has(String(node.state).toUpperCase())
        && (node.cluster_share ?? 0) >= MIN_NODE_SHARE
        && node.center_strike > low && node.center_strike < high)
      .sort((a, b) => (b.cluster_share ?? 0) - (a.cluster_share ?? 0));
  });

  ngOnChanges(changes: SimpleChanges): void {
    this.inputs.set({ spot: this.spot, nodes: this.nodes, captureId: this.captureId });
    if (!changes['date'] && !changes['captureTs']) return;
    this.request?.unsubscribe();
    this.decision.set(null);
    this.error.set(false);
    if (!this.date || !this.captureTs) return;
    this.loading.set(true);
    this.request = this.api.decisionJournal(this.date, this.captureTs).subscribe({
      next: value => { this.decision.set(value); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }

  constructor(private readonly api: TraceApiService) {}

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  side(type: string | null | undefined): string {
    return type === 'bull_put_credit' ? 'bull put' : type === 'bear_call_credit' ? 'bear call' : 'no direction';
  }

  failedGates(decision: Spx0DteDecisionJournalResponse): string[] {
    return Object.entries(decision.hard_gates ?? {}).filter(([, passed]) => !passed).map(([gate]) => GATE_LABEL[gate] ?? gate.replaceAll('_', ' '));
  }

  bandLabel(band: string | null | undefined): string {
    return band ? BAND_LABEL[band] ?? band.replaceAll('_', ' ') : 'no structure';
  }

  /** Cumulative 60-minute survival for this band from the published distance study. */
  bandEvidence(band: string | null | undefined): BandEvidence | null {
    if (!band) return null;
    const study = this.researchStatus?.studies.find(row => row.id === 'structure-distance-short-strike');
    const table = (study?.evidence_tables ?? []).find(row => row.scope === 'cumulative');
    const row = table?.rows.find(cells => cells[0] === (STUDY_BAND[band] ?? band));
    if (!table || !row) return null;
    const column = (name: string) => table.columns.findIndex(c => c.toLowerCase().startsWith(name));
    const rate = row[column('raw rate')], signals = row[column('n')];
    return rate ? { rate, signals: signals ?? '' } : null;
  }

  minutesLeft(): number | null {
    if (!this.captureTs) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(this.captureTs));
    const hour = Number(parts.find(p => p.type === 'hour')?.value), minute = Number(parts.find(p => p.type === 'minute')?.value);
    return Number.isFinite(hour) ? Math.max(0, 13 * 60 - (hour * 60 + minute)) : null;
  }

  duration(minutes: number): string {
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  }

  time(value: string | null): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }
}
