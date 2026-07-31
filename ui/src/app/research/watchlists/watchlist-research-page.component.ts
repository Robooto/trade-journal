import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { currentEquityHubUrl } from '../flow-ideas/utilities/equity-hub-url';
import { openInterestEquityHubUrl } from '../flow-ideas/utilities/equity-hub-url';
import {
  ResearchWatchlistSummary,
  WatchlistResearchItem,
  WatchlistResearchResponse,
  WatchlistSort,
  WatchlistSymbolAddResponse,
} from './watchlist-research.models';
import { WatchlistResearchApiService } from './watchlist-research-api.service';

interface WatchlistMetrics {
  total: number;
  withIvRank: number;
  held: number;
  movingIvRank: number;
}

@Component({
  selector: 'app-watchlist-research-page',
  templateUrl: './watchlist-research-page.component.html',
  styleUrls: ['./watchlist-research-page.component.scss'],
  standalone: false,
})
export class WatchlistResearchPageComponent implements OnInit, OnDestroy {
  response: WatchlistResearchResponse | null = null;
  loading = false;
  error: string | null = null;
  query = '';
  selectedWatchlist = 'all';
  sort: WatchlistSort = 'ivr-desc';
  heldOnly = false;
  symbolToAdd = '';
  destinationWatchlist = '';
  addingSymbol = false;
  addResult: WatchlistSymbolAddResponse | null = null;
  addError: string | null = null;

  readonly sortOptions: readonly { value: WatchlistSort; label: string }[] = [
    { value: 'ivr-desc', label: 'Highest IV rank' },
    { value: 'ivr-change', label: 'Largest IVR change' },
    { value: 'price-change', label: 'Largest 5-day price move' },
    { value: 'iv-index-change', label: 'Largest 5-day IV move' },
    { value: 'symbol', label: 'Symbol A-Z' },
  ];

  private requestSubscription: Subscription | null = null;
  private addSubscription: Subscription | null = null;

  constructor(private readonly api: WatchlistResearchApiService) {}

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.requestSubscription?.unsubscribe();
    this.addSubscription?.unsubscribe();
  }

  reload(): void {
    this.requestSubscription?.unsubscribe();
    this.loading = true;
    this.error = null;
    this.requestSubscription = this.api.load().subscribe({
      next: response => {
        this.response = response;
        if (
          this.destinationWatchlist &&
          !response.watchlists.some(
            watchlist => watchlist.name === this.destinationWatchlist,
          )
        ) {
          this.destinationWatchlist = '';
        }
        this.loading = false;
      },
      error: error => {
        this.error =
          error?.error?.detail ||
          'Brokerage watchlist research is unavailable right now.';
        this.loading = false;
      },
    });
  }

  get watchlists(): readonly ResearchWatchlistSummary[] {
    return this.response?.watchlists ?? [];
  }

  get normalizedSymbolToAdd(): string {
    return this.symbolToAdd.trim().toUpperCase();
  }

  get canAddSymbol(): boolean {
    return Boolean(
      this.response?.writes_enabled &&
      this.destinationWatchlist &&
      /^[A-Z0-9.^/-]{1,32}$/.test(this.normalizedSymbolToAdd) &&
      !this.addingSymbol,
    );
  }

  addSymbol(): void {
    if (!this.canAddSymbol) {
      return;
    }

    const watchlistName = this.destinationWatchlist;
    const symbol = this.normalizedSymbolToAdd;
    this.addSubscription?.unsubscribe();
    this.addingSymbol = true;
    this.addResult = null;
    this.addError = null;
    this.addSubscription = this.api.addSymbol(watchlistName, symbol).subscribe({
      next: result => {
        this.addResult = result;
        this.symbolToAdd = '';
        this.addingSymbol = false;
        this.reload();
      },
      error: error => {
        this.addError =
          error?.error?.detail ||
          'The symbol could not be added to the brokerage watchlist.';
        this.addingSymbol = false;
      },
    });
  }

  get visibleItems(): readonly WatchlistResearchItem[] {
    const normalizedQuery = this.query.trim().toUpperCase();
    const rows = (this.response?.items ?? []).filter(item => {
      const matchesSearch =
        !normalizedQuery || item.symbol.includes(normalizedQuery);
      const matchesList =
        this.selectedWatchlist === 'all' ||
        item.watchlists.some(list => list.name === this.selectedWatchlist);
      const matchesHolding = !this.heldOnly || item.exposure.is_held;
      return matchesSearch && matchesList && matchesHolding;
    });
    return [...rows].sort((left, right) => this.compare(left, right));
  }

  get metrics(): WatchlistMetrics {
    const items = this.response?.items ?? [];
    return {
      total: items.length,
      withIvRank: items.filter(item => item.volatility.iv_rank_percent != null).length,
      held: items.filter(item => item.exposure.is_held).length,
      movingIvRank: items.filter(
        item => Math.abs(item.volatility.iv_rank_5_day_change_percent ?? 0) >= 5,
      ).length,
    };
  }

  equityHubUrl(symbol: string): string {
    return currentEquityHubUrl(symbol);
  }

  oiEquityHubUrl(symbol: string): string {
    return openInterestEquityHubUrl(symbol);
  }

  formatPrice(value: number | null | undefined): string {
    return value == null
      ? 'Unavailable'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: value >= 100 ? 2 : 3,
        }).format(value);
  }

  formatPercent(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : value.toFixed(1) + '%';
  }

  formatChange(value: number | null | undefined, points = false): string {
    if (value == null) {
      return 'Unavailable';
    }
    const prefix = value > 0 ? '+' : '';
    return prefix + value.toFixed(1) + (points ? ' pts' : '%');
  }

  changeTone(value: number | null | undefined): string {
    if (value == null || value === 0) {
      return 'neutral';
    }
    return value > 0 ? 'positive' : 'negative';
  }

  ivRankTone(value: number | null | undefined): string {
    if (value == null) {
      return 'unavailable';
    }
    if (value >= 50) {
      return 'elevated';
    }
    if (value <= 20) {
      return 'low';
    }
    return 'middle';
  }

  earningsLabel(item: WatchlistResearchItem): string {
    if (item.earnings.earnings_date) {
      return item.earnings.earnings_date;
    }
    return item.earnings.status === 'unavailable'
      ? 'Unavailable'
      : item.earnings.status;
  }

  warningCount(item: WatchlistResearchItem): number {
    return item.warnings.length;
  }

  private compare(
    left: WatchlistResearchItem,
    right: WatchlistResearchItem,
  ): number {
    switch (this.sort) {
      case 'ivr-desc':
        return descending(
          left.volatility.iv_rank_percent,
          right.volatility.iv_rank_percent,
        );
      case 'ivr-change':
        return descendingAbsolute(
          left.volatility.iv_rank_5_day_change_percent,
          right.volatility.iv_rank_5_day_change_percent,
        );
      case 'price-change':
        return descendingAbsolute(
          left.price.five_session_change_percent,
          right.price.five_session_change_percent,
        );
      case 'iv-index-change':
        return descendingAbsolute(
          left.volatility.iv_index_5_day_change_percent,
          right.volatility.iv_index_5_day_change_percent,
        );
      default:
        return left.symbol.localeCompare(right.symbol);
    }
  }
}

function descending(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  return (right ?? Number.NEGATIVE_INFINITY) -
    (left ?? Number.NEGATIVE_INFINITY);
}

function descendingAbsolute(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  const leftValue = left == null ? -1 : Math.abs(left);
  const rightValue = right == null ? -1 : Math.abs(right);
  return rightValue - leftValue;
}
