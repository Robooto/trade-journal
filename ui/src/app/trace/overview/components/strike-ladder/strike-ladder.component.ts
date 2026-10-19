import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, SimpleChanges, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { StrikeLadderNode, StrikeLadderResponse, StrikeLadderRow } from '../../trace.models';

const DEFAULT_MAX_DISTANCE = 40;
const READ_LABEL: Record<string, string> = {
  market_richer: 'Market richer', in_line: 'In line', market_cheaper: 'Market cheaper',
};
const READ_HINT: Record<string, string> = {
  market_richer: 'The market prices a higher chance of finishing beyond this strike than history shows: favorable to the seller.',
  in_line: 'Market delta sits inside the historical range.',
  market_cheaper: 'History shows strikes this far finishing beyond more often than the market prices: unfavorable to the seller.',
};

/** Every short strike for the selected capture: what the market charges next to what history did. */
@Component({
  selector: 'app-strike-ladder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './strike-ladder.component.html',
  styleUrl: './strike-ladder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrikeLadderComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() captureTs: string | null = null;

  readonly ladder = signal<StrikeLadderResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly showAll = signal(false);
  private request?: Subscription;

  readonly puts = computed(() => this.side('put'));
  readonly calls = computed(() => this.side('call'));
  readonly hasPrices = computed(() => this.ladder()?.status === 'ok');

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['date'] && !changes['captureTs']) return;
    this.request?.unsubscribe();
    this.error.set(false);
    if (!this.date || !this.captureTs) {
      this.ladder.set(null);
      return;
    }
    this.loading.set(true);
    this.request = this.api.strikeLadder(this.date, this.captureTs).subscribe({
      next: value => { this.ladder.set(value); this.loading.set(false); },
      error: () => { this.ladder.set(null); this.error.set(true); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  private side(side: 'put' | 'call'): StrikeLadderRow[] {
    const limit = this.showAll() ? Infinity : DEFAULT_MAX_DISTANCE;
    return (this.ladder()?.rows ?? [])
      .filter(row => row.side === side && row.distance_points <= limit)
      .sort((a, b) => a.distance_points - b.distance_points);
  }

  pct(value: number | null | undefined, digits = 0): string {
    return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`;
  }

  interval(row: StrikeLadderRow): string {
    const i = row.history?.finished_beyond_interval;
    return i ? `95% range ${this.pct(i[0])}–${this.pct(i[1])} over ${row.history?.sessions} sessions` : '';
  }

  money(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `$${value.toFixed(0)}`;
  }

  readLabel(row: StrikeLadderRow): string { return row.pricing_read ? READ_LABEL[row.pricing_read] : ''; }
  readHint(row: StrikeLadderRow): string { return row.pricing_read ? READ_HINT[row.pricing_read] : ''; }

  nodeLabel(node: StrikeLadderNode): string {
    const state = (node.state ?? '').toUpperCase();
    const trend = state === 'STRENGTHENING' ? ' ▲' : state === 'WEAKENING' ? ' ▼' : '';
    return `${node.sign === 'negative' ? '−' : '+'}${node.strike.toFixed(0)}${trend}`;
  }

  nodeTitle(node: StrikeLadderNode): string {
    const share = node.share === null ? '' : ` · ${(node.share * 100).toFixed(1)}% of gamma`;
    const change = node.share_change ? ` (${node.share_change > 0 ? '+' : ''}${(node.share_change * 100).toFixed(1)} pts)` : '';
    return `${node.sign} node ${node.strike}${share}${change} · ${String(node.state ?? '').toLowerCase()}`;
  }

  duration(minutes: number): string {
    const m = Math.round(minutes);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  time(value: string | null | undefined): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }

  flowLabel(): string | null {
    const flow = this.ladder()?.flow;
    if (!flow || flow.move_30m_points == null) return null;
    const move = `SPX ${flow.move_30m_points > 0 ? '+' : ''}${flow.move_30m_points.toFixed(1)} pts / 30m`;
    const hiro = flow.hiro_change_30m == null ? '' : ` · HIRO ${this.compact(flow.hiro_change_30m)} / 30m`;
    if (flow.hiro_flat) return `${move}${hiro} · HIRO flat`;
    if (flow.hiro_confirms_move == null) return `${move}${hiro} · no clear move`;
    const side = flow.side_against_move === 'put' ? 'puts below' : 'calls above';
    return flow.hiro_confirms_move
      ? `${move}${hiro} · HIRO confirms the move · ${side} sit against it`
      : `${move}${hiro} · HIRO opposes the move · ${side} sit against it`;
  }

  /**
   * Which side of HIRO's 30-minute read a row sits on (H4b, a lead): against a HIRO-confirmed move
   * was touched less in development (42% vs 61%); against a move HIRO opposes was touched more.
   */
  hiroTag(row: StrikeLadderRow): { label: string; tone: 'lead' | 'caution'; title: string } | null {
    const flow = this.ladder()?.flow;
    if (!flow || flow.hiro_flat || flow.hiro_confirms_move == null || row.side !== flow.side_against_move) return null;
    return flow.hiro_confirms_move
      ? { label: 'HIRO side', tone: 'lead',
          title: 'Against a HIRO-confirmed move: touched less often in development (42% vs 61%). A lead, not established.' }
      : { label: 'HIRO opposes', tone: 'caution',
          title: 'Against a move HIRO opposes: touched more often in development (61% vs 42%). A lead, not established.' };
  }

  private compact(value: number): string {
    const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
    const abs = Math.abs(value);
    return abs >= 1e9 ? `${sign}${(abs / 1e9).toFixed(2)}B` : `${sign}${(abs / 1e6).toFixed(0)}M`;
  }

  pickLabel(): string | null {
    const pick = this.ladder()?.bot_pick;
    if (!pick?.decision) return null;
    if (pick.decision !== 'take' || !pick.short_strike) return `Bot: ${pick.decision}${pick.trade_type ? ' · ' + pick.trade_type.replaceAll('_', ' ') : ''}`;
    return `Bot take: ${pick.side === 'put' ? 'bull put' : 'bear call'} short ${pick.short_strike}`;
  }
}
