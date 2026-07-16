import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription, debounceTime, distinctUntilChanged, finalize, merge } from 'rxjs';
import {
  BrokerActivityInbox,
  BrokerActivityDispositionStatus,
  BrokerActivityReviewEvent,
  JournalEntry,
  JournalEntryPrefill,
  PaginatedJournalEntries,
} from '../journal.models';
import { JournalApiService } from '../journal-api.service';

@Component({
  selector: 'app-journal-page',
  templateUrl: './journal-page.component.html',
  styleUrls: ['./journal-page.component.scss'],
  standalone: false,
})
export class JournalPageComponent implements OnInit, OnDestroy {
  entries: JournalEntry[] = [];
  totalEntries = 0;
  pageSkip = 0;
  pageLimit = 15;
  selectedEntry?: JournalEntry;
  showForm = false;
  loading = false;
  errorMessage = '';
  activityInbox?: BrokerActivityInbox;
  activityLoading = false;
  activityError = '';
  activityActionError = '';
  showCompletedActivity = false;
  dispositionSaving = new Set<string>();
  entryPrefill?: JournalEntryPrefill;
  pendingActivityReviews: Array<{
    activityGroupId: string;
    sessionDate: string;
  }> = [];

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly tickerControl = new FormControl('', { nonNullable: true });
  private filterSubscription?: Subscription;

  constructor(
    private api: JournalApiService,
    @Optional() private route?: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.showForm = this.route?.snapshot.queryParamMap.get('new') === '1';
    this.loadNextPage();
    this.loadActivityInbox();
    this.filterSubscription = merge(
      this.searchControl.valueChanges,
      this.tickerControl.valueChanges
    ).pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.reload());
  }

  ngOnDestroy(): void {
    this.filterSubscription?.unsubscribe();
  }

  get hasFilters(): boolean {
    return Boolean(this.searchControl.value.trim() || this.tickerControl.value.trim());
  }

  get visibleActivityEvents(): BrokerActivityReviewEvent[] {
    const events = this.activityInbox?.events ?? [];
    return this.showCompletedActivity
      ? events
      : events.filter(event => event.review_status === 'pending');
  }

  get completedActivityCount(): number {
    return (this.activityInbox?.reviewed_count ?? 0)
      + (this.activityInbox?.skipped_count ?? 0);
  }

  loadActivityInbox(): void {
    if (this.activityLoading) {
      return;
    }
    this.activityLoading = true;
    this.activityError = '';
    this.activityActionError = '';
    this.api.activityInbox().pipe(
      finalize(() => (this.activityLoading = false))
    ).subscribe({
      next: inbox => {
        this.activityInbox = inbox;
      },
      error: error => {
        this.activityError =
          error?.error?.detail || 'Previous-session activity could not be loaded.';
      },
    });
  }

  addActivityToJournal(event: BrokerActivityReviewEvent): void {
    const symbol = event.underlying_symbol?.trim().toUpperCase();
    const activityDate = this.activityInbox?.session_date || event.session_date;
    if (!this.showForm) {
      this.selectedEntry = undefined;
      this.pendingActivityReviews = [];
    }
    if (!this.pendingActivityReviews.some(
      item => item.activityGroupId === event.activity_group_id
        && item.sessionDate === activityDate
    )) {
      this.pendingActivityReviews.push({
        activityGroupId: event.activity_group_id,
        sessionDate: activityDate,
      });
    }
    this.entryPrefill = {
      tickers: symbol ? [symbol] : [],
      sourceLabel: `Broker activity · ${symbol || 'Account'} · ${activityDate}`,
      sourceUrl:
        `/journal?activityDate=${activityDate}` +
        `&activityId=${encodeURIComponent(event.activity_group_id)}`,
      notes: this.factualActivityNotes(event, activityDate),
      activityGroupId: event.activity_group_id,
      activitySessionDate: activityDate,
    };
    this.showForm = true;
  }

  setActivityDisposition(
    event: BrokerActivityReviewEvent,
    status: BrokerActivityDispositionStatus,
    journalEntryId?: string
  ): void {
    if (this.dispositionSaving.has(event.activity_group_id)) {
      return;
    }
    this.dispositionSaving.add(event.activity_group_id);
    this.activityActionError = '';
    this.api.setActivityDisposition(
      event.activity_group_id,
      event.session_date,
      status,
      journalEntryId
    ).pipe(
      finalize(() => this.dispositionSaving.delete(event.activity_group_id))
    ).subscribe({
      next: disposition => {
        event.review_status = disposition.status;
        event.journal_entry_id = disposition.journal_entry_id;
        this.recountActivity();
      },
      error: error => {
        this.activityActionError =
          error?.error?.detail || 'Review status could not be saved. Try again.';
      },
    });
  }

  private recountActivity(): void {
    if (!this.activityInbox) {
      return;
    }
    this.activityInbox.reviewed_count = this.activityInbox.events.filter(
      event => event.review_status === 'reviewed'
    ).length;
    this.activityInbox.skipped_count = this.activityInbox.events.filter(
      event => event.review_status === 'skipped'
    ).length;
    this.activityInbox.pending_count = this.activityInbox.events.length
      - this.completedActivityCount;
  }

  private factualActivityNotes(
    event: BrokerActivityReviewEvent,
    activityDate: string
  ): string {
    const lines = [
      `Broker activity from ${activityDate}`,
      event.summary,
    ];
    const legs = event.legs
      .map(leg => {
        const description = [
          leg.action,
          leg.quantity != null ? `${leg.quantity}x` : '',
          leg.symbol,
        ].filter(Boolean).join(' ');
        return leg.price != null
          ? `${description} @ $${leg.price.toFixed(2)}`
          : description;
      })
      .filter(Boolean);
    if (legs.length) {
      lines.push(`Legs: ${legs.join('; ')}`);
    }
    const underlying = event.market_context?.underlying;
    const benchmark = event.market_context?.benchmark;
    if (underlying?.activity_price != null) {
      lines.push(
        `Estimated entry-time context (nearest 5-minute close): ` +
        `${underlying.symbol} $${underlying.activity_price.toFixed(2)}` +
        `${this.formatSignedPercent(underlying.activity_from_open_percent, ' from open')}`
      );
      if (underlying.session_open != null && underlying.session_high != null
          && underlying.session_low != null && underlying.session_close != null) {
        lines.push(
          `Session OHLC: $${underlying.session_open.toFixed(2)} / ` +
          `$${underlying.session_high.toFixed(2)} / ` +
          `$${underlying.session_low.toFixed(2)} / ` +
          `$${underlying.session_close.toFixed(2)}`
        );
      }
    } else if (underlying) {
      lines.push(`Entry-time price context for ${underlying.symbol}: unavailable`);
    }
    if (benchmark?.activity_price != null) {
      lines.push(
        `${benchmark.symbol} near activity: $${benchmark.activity_price.toFixed(2)}` +
        `${this.formatSignedPercent(benchmark.activity_from_open_percent, ' from open')}`
      );
    }
    if (event.grouping_status === 'ambiguous') {
      lines.push('Data note: broker grouping was ambiguous; review the legs.');
    }
    lines.push(
      '',
      'Why I made this trade:',
      '',
      'What I expected:',
      '',
      'What would change my mind:'
    );
    return lines.join('\n');
  }

  formatSignedPercent(
    value: number | null | undefined,
    suffix: string = ''
  ): string {
    if (value == null) {
      return '';
    }
    const sign = value > 0 ? '+' : '';
    return ` ${sign}${value.toFixed(2)}%${suffix}`;
  }

  activityChartPoints(event: BrokerActivityReviewEvent): string {
    const bars = event.market_context?.underlying?.bars ?? [];
    if (bars.length < 2) {
      return '';
    }
    const { low, range } = this.activityChartBounds(event);
    return bars.map((bar, index) => {
      const x = (index / (bars.length - 1)) * 100;
      const y = 36 - (((bar.close - low) / range) * 32 + 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  activityMarkerX(event: BrokerActivityReviewEvent): number {
    const underlying = event.market_context?.underlying;
    const bars = underlying?.bars ?? [];
    if (!underlying?.matched_at || bars.length < 2) {
      return 0;
    }
    const target = new Date(underlying.matched_at).getTime();
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    bars.forEach((bar, index) => {
      const distance = Math.abs(bar.time - target);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    return (closestIndex / (bars.length - 1)) * 100;
  }

  activityMarkerY(event: BrokerActivityReviewEvent): number {
    const price = event.market_context?.underlying?.activity_price;
    if (price == null) {
      return 0;
    }
    const { low, range } = this.activityChartBounds(event);
    return 36 - (((price - low) / range) * 32 + 2);
  }

  private activityChartBounds(
    event: BrokerActivityReviewEvent
  ): { low: number; range: number } {
    const bars = event.market_context?.underlying?.bars ?? [];
    const low = Math.min(...bars.map(bar => bar.low));
    const high = Math.max(...bars.map(bar => bar.high));
    return {
      low: Number.isFinite(low) ? low : 0,
      range: Number.isFinite(high - low) && high !== low ? high - low : 1,
    };
  }

  loadNextPage(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.api.list(
      this.pageSkip,
      this.pageLimit,
      this.searchControl.value,
      this.tickerControl.value
    ).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (result: PaginatedJournalEntries) => {
        this.entries = [...this.entries, ...result.items];
        this.totalEntries = result.total;
        this.pageSkip += result.items.length;
      },
      error: error => {
        this.errorMessage = error?.error?.detail || 'Journal entries could not be loaded.';
      },
    });
  }

  reload(): void {
    this.entries = [];
    this.totalEntries = 0;
    this.pageSkip = 0;
    this.loadNextPage();
  }

  clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.tickerControl.setValue('', { emitEvent: false });
    this.reload();
  }

  openNewEntry(): void {
    this.selectedEntry = undefined;
    this.showForm = true;
    this.entryPrefill = undefined;
    this.pendingActivityReviews = [];
  }

  toggleForm(): void {
    if (this.showForm) {
      this.showForm = false;
      this.selectedEntry = undefined;
      this.entryPrefill = undefined;
      this.pendingActivityReviews = [];
    } else {
      this.openNewEntry();
    }
  }

  onEntrySelected(entry: JournalEntry): void {
    this.entryPrefill = undefined;
    this.pendingActivityReviews = [];
    this.selectedEntry = entry;
    this.showForm = true;
  }

  onEntrySaved(entry: JournalEntry): void {
    for (const pending of this.pendingActivityReviews) {
      const activityEvent = this.activityInbox?.events.find(
        item => item.activity_group_id === pending.activityGroupId
          && item.session_date === pending.sessionDate
      );
      if (activityEvent) {
        this.setActivityDisposition(activityEvent, 'reviewed', entry.id);
      }
    }
    this.pendingActivityReviews = [];
    this.selectedEntry = undefined;
    this.showForm = false;
    this.reload();
    this.entryPrefill = undefined;
  }

  onEditCancelled(): void {
    this.selectedEntry = undefined;
    this.showForm = false;
    this.entryPrefill = undefined;
    this.pendingActivityReviews = [];
  }

  onEntryDeleted(id: string): void {
    this.entries = this.entries.filter(entry => entry.id !== id);
    this.totalEntries = Math.max(this.totalEntries - 1, 0);
    this.selectedEntry = undefined;
    this.showForm = false;
    this.entryPrefill = undefined;
    this.pendingActivityReviews = [];
  }
}
