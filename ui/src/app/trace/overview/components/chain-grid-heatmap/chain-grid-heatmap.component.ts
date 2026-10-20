import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { ChainGridColumn, ChainGridViewResponse } from '../../trace.models';

type Side = 'put' | 'call';
type Metric = 'credit' | 'delta';
export type HiroStrip = 'tagged' | 'opposes' | 'flat' | 'none';

/** Dark-surface sequential blue: near zero recedes toward the panel, large values are light. */
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];
const WIDTH = 960;
const LEFT = 52;
const RIGHT = 12;
const TOP = 8;
const ROW = 16;
const STRIP = 10;
const AXIS = 22;
const STEP = 5;

export interface HeatCell { x: number; y: number; w: number; h: number; fill: string; title: string; }

/** The ladder's per-side HIRO tag for one capture, so the strip reads the same as the ladder. */
export function hiroStrip(column: ChainGridColumn, side: Side): HiroStrip {
  const hiro = column.hiro;
  if (hiro.state === 'flat') return 'flat';
  if (hiro.side_against_move !== side) return 'none';
  return hiro.state === 'confirms' ? 'tagged' : hiro.state === 'opposes' ? 'opposes' : 'none';
}

/** Every OTM spread's credit or delta by strike and capture, with SPX, nodes and a HIRO strip. */
@Component({
  selector: 'app-chain-grid-heatmap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chain-grid-heatmap.component.html',
  styleUrl: './chain-grid-heatmap.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainGridHeatmapComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() captureTs: string | null = null;
  /** The session's latest capture; a new one reloads the grid in place. */
  @Input() latestTs: string | null = null;
  @Output() readonly captureSelected = new EventEmitter<string>();

  readonly view = signal<ChainGridViewResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly side = signal<Side>('call');
  readonly metric = signal<Metric>('credit');
  readonly selected = signal<string | null>(null);
  readonly width = WIDTH;
  private request?: Subscription;

  readonly columns = computed(() => this.view()?.captures ?? []);
  readonly strikes = computed(() => {
    const side = this.side();
    const set = new Set<number>();
    for (const column of this.columns()) for (const cell of column.cells) if (cell.side === side) set.add(cell.strike);
    return [...set].sort((a, b) => b - a);
  });
  readonly plotHeight = computed(() => Math.max(1, this.strikes().length) * ROW);
  readonly height = computed(() => TOP + this.plotHeight() + 4 + STRIP + AXIS);
  readonly columnWidth = computed(() => (WIDTH - LEFT - RIGHT) / Math.max(1, this.columns().length));
  readonly maximum = computed(() => {
    const side = this.side(), metric = this.metric();
    const values = this.columns().flatMap(c => c.cells.filter(cell => cell.side === side).map(cell => this.value(cell.credit, cell.delta, metric)))
      .filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    // The 95th percentile keeps one rich strike from washing out the rest.
    return values.length ? values[Math.floor(0.95 * (values.length - 1))] : 1;
  });

  readonly cells = computed<HeatCell[]>(() => {
    const side = this.side(), metric = this.metric(), w = this.columnWidth(), top = this.strikes()[0];
    const out: HeatCell[] = [];
    this.columns().forEach((column, i) => {
      for (const cell of column.cells) {
        if (cell.side !== side) continue;
        const value = this.value(cell.credit, cell.delta, metric);
        if (value === null) continue;
        out.push({ x: LEFT + i * w + 1, y: TOP + ((top - cell.strike) / STEP) * ROW + 1, w: Math.max(1, w - 2), h: ROW - 2,
          fill: this.color(value), title: `${cell.strike} ${side} · ${this.time(column.ts)} · credit ${this.money(cell.credit)}`
            + ` · mid ${this.money(cell.mid_credit)} · delta ${cell.delta === null ? '—' : cell.delta.toFixed(2)}` });
      }
    });
    return out;
  });

  readonly spotPath = computed(() => this.columns().map((c, i) => `${i ? 'L' : 'M'}${this.cx(i).toFixed(1)},${this.y(c.spot).toFixed(1)}`).join(' '));
  readonly settlementY = computed(() => { const s = this.view()?.settlement; return s == null ? null : this.y(s); });
  readonly nodeMarks = computed(() => this.columns().flatMap((c, i) => c.nodes
    // Only nodes on the side shown: between SPX and the strikes a spread on that side would sell.
    .filter(n => this.inRange(n.strike) && (this.side() === 'call' ? n.strike > c.spot : n.strike < c.spot))
    .map(n => ({ x: this.cx(i), y: this.y(n.strike), negative: n.sign === 'negative', title: `${n.sign ?? ''} node ${n.strike.toFixed(0)} · ${this.time(c.ts)}` }))));
  readonly strip = computed(() => this.columns().map((c, i) => ({ x: LEFT + i * this.columnWidth() + 1, w: Math.max(1, this.columnWidth() - 2),
    state: hiroStrip(c, this.side()), title: this.stripTitle(c) })));
  readonly selectedIndex = computed(() => this.columns().findIndex(c => c.ts === this.selected()));
  readonly ticks = computed(() => this.columns().map((c, i) => ({ x: this.cx(i), label: this.time(c.ts), ts: c.ts }))
    .filter(t => t.ts.slice(14, 16) === '00'));
  readonly strikeLabels = computed(() => this.strikes().filter(s => s % 10 === 0).map(s => ({ y: this.y(s) + 3, label: s })));
  readonly stripY = computed(() => TOP + this.plotHeight() + 4);

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['captureTs']) this.selected.set(this.captureTs);
    const newDate = !!changes['date'];
    if (!newDate && !(changes['latestTs'] && !changes['latestTs'].firstChange)) return;
    this.request?.unsubscribe();
    this.error.set(false);
    if (!this.date) { this.view.set(null); return; }
    // A new capture on the same date swaps the grid in place; a new date shows the loading state.
    if (newDate || !this.view()) this.loading.set(true);
    this.request = this.api.chainGrid(this.date).subscribe({
      next: value => { this.view.set(value); this.loading.set(false); },
      error: () => { this.view.set(null); this.error.set(true); this.loading.set(false); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  select(index: number): void {
    const column = this.columns()[index];
    if (!column) return;
    this.selected.set(column.ts);
    this.captureSelected.emit(column.ts);
  }

  columnAt(event: MouseEvent, svg: Element): number {
    const box = svg.getBoundingClientRect();
    const x = (event.clientX - box.left) * (WIDTH / box.width);
    return Math.floor((x - LEFT) / this.columnWidth());
  }

  cx(index: number): number { return LEFT + (index + 0.5) * this.columnWidth(); }

  y(price: number): number {
    const top = this.strikes()[0];
    return top === undefined ? TOP : TOP + ((top - price) / STEP) * ROW + ROW / 2;
  }

  inRange(price: number): boolean {
    const s = this.strikes();
    return s.length > 0 && price <= s[0] + STEP / 2 && price >= s[s.length - 1] - STEP / 2;
  }

  value(credit: number, delta: number | null, metric: Metric): number | null {
    return metric === 'credit' ? credit : delta;
  }

  color(value: number): string {
    const ratio = Math.max(0, Math.min(1, value / this.maximum()));
    return RAMP[Math.round(ratio * (RAMP.length - 1))];
  }

  legendStops(): string { return `linear-gradient(90deg, ${RAMP.join(', ')})`; }

  legendMaximum(): string {
    return this.metric() === 'credit' ? `${this.money(this.maximum())}+` : `${this.maximum().toFixed(2)}+`;
  }

  stripTitle(c: ChainGridColumn): string {
    const hiro = c.hiro;
    const move = hiro.move_30m_points === null ? '' : ` · 30m move ${hiro.move_30m_points > 0 ? '+' : ''}${hiro.move_30m_points}`;
    const change = hiro.change_30m === null ? '' : ` · HIRO ${(hiro.change_30m / 1e9).toFixed(2)}B`;
    const label = { tagged: 'HIRO side (confirms the move)', opposes: 'HIRO opposes the move', flat: 'HIRO flat', none: 'No HIRO tag on this side' }[hiroStrip(c, this.side())];
    return `${this.time(c.ts)} · ${label}${move}${change}`;
  }

  time(ts: string): string {
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? ts : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(date);
  }

  money(value: number): string { return `$${Math.round(value).toLocaleString('en-US')}`; }
}
