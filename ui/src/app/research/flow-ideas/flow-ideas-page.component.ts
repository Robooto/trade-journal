import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  Subject,
  Subscription,
  debounceTime,
  distinctUntilChanged,
} from 'rxjs';

import {
  FlowBrokerageEnrichment,
  FlowCandidate,
  FlowIdeasRouteState,
} from './flow-ideas.models';
import { FlowChangeOption } from './components/flow-filters/flow-filters.component';
import { FlowIdeasFacade } from './data-access/flow-ideas.facade';
import { FlowIdeasApiService } from './data-access/flow-ideas-api.service';
import { FlowUploadState } from './components/report-upload/report-upload.component';

@Component({
  selector: 'app-flow-ideas-page',
  templateUrl: './flow-ideas-page.component.html',
  styleUrls: ['./flow-ideas-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowIdeasPageComponent implements OnDestroy {
  private readonly subscriptions = new Subscription();
  private readonly symbolInput = new Subject<string>();

  uploadState: FlowUploadState = 'idle';
  uploadMessage: string | null = null;

  private routeState: FlowIdeasRouteState = {
    server: {
      tradingDate: '',
      symbol: '',
      event: '',
      activeOnly: true,
    },
    display: {
      includeIndexEtfs: true,
      watchlist: 'all',
      portfolio: 'all',
    },
  };

  /**
   * RF-02 owns the proxy. This relative handoff keeps the mini address out of
   * the Angular bundle and opens the existing Trace UI in a new tab.
   */
  readonly traceUrl = '/research-api/';
  readonly eventOptions: readonly FlowChangeOption[] = [
    { value: '', label: 'All changes' },
    { value: 'new', label: 'New' },
    { value: 'returned', label: 'Returned' },
    { value: 'reversed', label: 'Reversed' },
    { value: 'strengthened', label: 'Strengthened' },
    { value: 'weakened', label: 'Weakened' },
  ];

  constructor(
    readonly facade: FlowIdeasFacade,
    private readonly api: FlowIdeasApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe(params => this.applyRouteState(params)),
    );
    this.subscriptions.add(
      this.facade.routeStateChanges$.subscribe(state => this.syncRoute(state)),
    );
    this.subscriptions.add(
      this.symbolInput
        .pipe(debounceTime(220), distinctUntilChanged())
        .subscribe(symbol => this.facade.setServerFilters({ symbol })),
    );

    this.facade.loadDates();
    this.facade.loadWatchlists();
  }

  onDateChange(tradingDate: string): void {
    this.facade.setServerFilters({ tradingDate });
  }

  onSymbolInput(symbol: string): void {
    this.symbolInput.next(symbol);
  }

  onEventChange(event: string): void {
    this.facade.setServerFilters({ event });
  }

  onActiveOnlyChange(activeOnly: boolean): void {
    this.facade.setServerFilters({ activeOnly });
  }

  onUniverseChange(includeIndexEtfs: boolean): void {
    this.facade.setDisplayFilters({ includeIndexEtfs });
  }

  onWatchlistChange(watchlist: string): void {
    this.facade.setDisplayFilters({ watchlist });
  }

  onPortfolioChange(portfolio: 'all' | 'held' | 'not-held'): void {
    this.facade.setDisplayFilters({ portfolio });
  }

  selectCandidate(candidate: FlowCandidate): void {
    this.facade.selectCandidate(candidate.symbol);
    void this.router.navigate(
      ['/research/flow-ideas', candidate.trading_date, candidate.symbol],
      { queryParams: this.route.snapshot.queryParams },
    );
  }

  refresh(): void {
    this.facade.reload();
  }

  onReportUpload(file: File): void {
    if (this.uploadState === 'pending') return;
    this.uploadState = 'pending';
    this.uploadMessage = 'Processing report on the research mini...';
    const subscription = this.api.uploadReport(file).subscribe({
      next: receipt => {
        this.uploadState = 'success';
        this.uploadMessage = receipt.message || 'FlowPatrol report processed.';
        this.facade.refreshAfterUpload(receipt.report_date ?? null, receipt.latest_trading_date ?? null);
      },
      error: error => {
        const response = error as HttpErrorResponse;
        this.uploadState = response.status === 409 ? 'conflict' : response.status === 400 ? 'validation' : 'error';
        this.uploadMessage = safeUploadMessage(response);
      },
    });
    this.subscriptions.add(subscription);
  }

  brokerageStatusTitle(status: FlowBrokerageEnrichment['status']): string {
    return {
      partial: 'Brokerage context is partial',
      unavailable: 'Brokerage context is unavailable',
      disabled: 'Brokerage context is disabled',
      not_requested: 'Brokerage context was not requested',
      ready: 'Brokerage context is ready',
    }[status];
  }

  brokerageStatusMessage(context: FlowBrokerageEnrichment): string {
    if (context.status === 'partial') {
      return (
        'Available for ' +
        context.matched_symbol_count +
        ' of ' +
        context.requested_symbol_count +
        ' queue symbols.'
      );
    }
    if (context.status === 'unavailable') {
      return 'FlowPatrol ideas remain available without supporting brokerage context.';
    }
    if (context.status === 'disabled') {
      return 'Brokerage enrichment is disabled in this environment.';
    }
    return 'This queue response did not request brokerage enrichment.';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private applyRouteState(params: ParamMap): void {
    const next: FlowIdeasRouteState = {
      server: {
        tradingDate: params.get('date') ?? '',
        symbol: params.get('symbol') ?? '',
        event: params.get('event') ?? '',
        activeOnly: params.get('active') !== 'false',
      },
      display: {
        includeIndexEtfs: params.get('universe') !== 'equities',
        watchlist: params.get('watchlist') ?? 'all',
        portfolio: parsePortfolio(params.get('portfolio')),
      },
    };

    this.routeState = next;
    this.facade.setServerFilters(next.server);
    this.facade.setDisplayFilters(next.display);
  }

  private syncRoute(next: FlowIdeasRouteState): void {
    if (sameRouteState(next, this.routeState)) {
      return;
    }

    this.routeState = next;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        date: next.server.tradingDate || null,
        symbol: next.server.symbol || null,
        event: next.server.event || null,
        active: String(next.server.activeOnly),
        universe: next.display.includeIndexEtfs ? 'all' : 'equities',
        watchlist: next.display.watchlist === 'all' ? null : next.display.watchlist,
        portfolio: next.display.portfolio === 'all' ? null : next.display.portfolio,
      },
      replaceUrl: true,
    });
  }
}

function sameRouteState(
  left: FlowIdeasRouteState,
  right: FlowIdeasRouteState,
): boolean {
  return (
    left.server.tradingDate === right.server.tradingDate &&
    left.server.symbol === right.server.symbol &&
    left.server.event === right.server.event &&
    left.server.activeOnly === right.server.activeOnly &&
    left.display.includeIndexEtfs === right.display.includeIndexEtfs &&
    left.display.watchlist === right.display.watchlist &&
    left.display.portfolio === right.display.portfolio
  );
}

function parsePortfolio(value: string | null): 'all' | 'held' | 'not-held' {
  return value === 'held' || value === 'not-held' ? value : 'all';
}

function safeUploadMessage(error: HttpErrorResponse): string {
  const body = error.error as { detail?: string; error?: { message?: string } } | null;
  return body?.error?.message ?? body?.detail ?? 'FlowPatrol upload could not be completed.';
}
