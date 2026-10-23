import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Inject, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subscription, forkJoin } from 'rxjs';

import {
  SpreadOrder,
  SpreadOrderConfig,
  SpreadOrdersApiService,
  SpreadPreview,
  SpreadQuote,
  SpreadSide,
} from '../../data-access/spread-orders-api.service';

export interface SpreadTicketData { side: SpreadSide; strike: number; }

const QUOTE_REFRESH_MS = 5000;
const ORDER_POLL_MS = 2000;
const TICK = 0.05;
/** Snap to the $0.05 tick as an exact two-decimal number (1.15, never 1.1500000000000001). */
const snap = (value: number) => Number((Math.round(value / TICK) * TICK).toFixed(2));

/**
 * One manual SPXW 0DTE credit spread: live quotes, tastytrade's dry-run preview, a confirmed send,
 * then fill tracking with reprice and cancel. Opens on a still-working order instead when there is one.
 */
@Component({
  selector: 'app-spread-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './spread-ticket.component.html',
  styleUrl: './spread-ticket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpreadTicketComponent implements OnInit, OnDestroy {
  readonly config = signal<SpreadOrderConfig | null>(null);
  readonly quote = signal<SpreadQuote | null>(null);
  readonly preview = signal<SpreadPreview | null>(null);
  readonly previewedPrice = signal<number | null>(null);
  readonly order = signal<SpreadOrder | null>(null);
  readonly price = signal<number | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmed = signal(false);

  readonly side: SpreadSide;
  readonly strike: number;
  private quoteTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private request?: Subscription;

  readonly title = computed(() => {
    const o = this.order();
    const side = o?.side ?? this.side;
    const short = o?.short_strike ?? this.strike;
    const long = o?.long_strike ?? (side === 'call' ? short + 5 : short - 5);
    return `${side === 'call' ? 'Bear call' : 'Bull put'} ${short}/${long}`;
  });
  readonly maxLoss = computed(() => {
    const price = this.price();
    return price === null ? null : (5 - price) * 100;
  });
  readonly previewCurrent = computed(() => this.preview() !== null && this.previewedPrice() === this.price());
  readonly canSend = computed(() => {
    const c = this.config();
    return !!c?.live_enabled && !!c.account_number && this.previewCurrent() && this.confirmed() && !this.busy();
  });
  readonly working = computed(() => this.order()?.working ?? false);

  constructor(
    @Inject(MAT_DIALOG_DATA) data: SpreadTicketData,
    private readonly dialogRef: MatDialogRef<SpreadTicketComponent>,
    private readonly api: SpreadOrdersApiService,
  ) {
    this.side = data.side;
    this.strike = data.strike;
  }

  ngOnInit(): void {
    this.busy.set(true);
    forkJoin({ config: this.api.config(), today: this.api.today() }).subscribe({
      next: ({ config, today }) => {
        this.config.set(config);
        const working = today.rows.find(row => row.working);
        this.busy.set(false);
        if (working) {
          this.showOrder(working);
          this.error.set('An order from earlier is still working; finish it before sending another.');
        } else {
          this.loadQuote(true);
          this.quoteTimer = setInterval(() => this.loadQuote(false), QUOTE_REFRESH_MS);
        }
      },
      error: err => this.fail(err),
    });
  }

  ngOnDestroy(): void {
    this.stopQuotes();
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.request?.unsubscribe();
  }

  setPrice(value: number | string | null): void {
    const number = Number(value);
    this.price.set(Number.isFinite(number) && number > 0 ? snap(number) : null);
    this.confirmed.set(false);
  }

  step(direction: 1 | -1): void {
    const current = this.price() ?? this.quote()?.suggested_price ?? TICK;
    const next = snap(current + direction * TICK);
    if (next >= TICK && next < 5) this.setPrice(next);
  }

  runPreview(): void {
    const price = this.price();
    if (price === null) return;
    this.run(this.api.preview(this.side, this.strike, price), preview => {
      this.preview.set(preview);
      this.previewedPrice.set(price);
    });
  }

  send(): void {
    const price = this.price();
    if (price === null || !this.canSend()) return;
    this.run(this.api.submit(this.side, this.strike, price), order => {
      this.stopQuotes();
      this.showOrder(order);
    });
  }

  lowerCredit(): void {
    const o = this.order();
    if (!o) return;
    const next = snap(o.limit_price - TICK);
    if (next < TICK) return;
    this.run(this.api.reprice(o.id, next), order => this.showOrder(order));
  }

  cancel(): void {
    const o = this.order();
    if (o) this.run(this.api.cancel(o.id), order => this.showOrder(order));
  }

  close(): void { this.dialogRef.close(this.order()); }

  money(value: number | null | undefined, digits = 2): string {
    return value === null || value === undefined ? '—' : `$${value.toFixed(digits)}`;
  }

  dollars(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    const sign = value < 0 ? '−' : '';
    return `${sign}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }

  private loadQuote(first: boolean): void {
    this.api.quote(this.side, this.strike).subscribe({
      next: quote => {
        this.quote.set(quote);
        if (first && quote.suggested_price !== null) this.setPrice(quote.suggested_price);
      },
      error: err => { if (first) this.fail(err); },
    });
  }

  private showOrder(order: SpreadOrder): void {
    this.order.set(order);
    this.price.set(order.limit_price);
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (order.working) {
      this.pollTimer = setTimeout(() => this.api.refresh(order.id).subscribe({
        next: next => this.showOrder(next),
        error: () => this.showOrder(order),  // Keep polling through a transient failure.
      }), ORDER_POLL_MS);
    }
  }

  private run<T>(source: Observable<T>, done: (value: T) => void): void {
    this.busy.set(true);
    this.error.set(null);
    this.request?.unsubscribe();
    this.request = source.subscribe({
      next: value => { this.busy.set(false); done(value); },
      error: err => this.fail(err),
    });
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    const detail = err instanceof HttpErrorResponse ? err.error?.detail : null;
    this.error.set(typeof detail === 'string' ? detail : 'The request failed. Check the order in tastytrade before trying again.');
  }

  private stopQuotes(): void {
    if (this.quoteTimer !== null) clearInterval(this.quoteTimer);
    this.quoteTimer = null;
  }
}
