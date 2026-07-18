import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subscription,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  merge,
  switchMap,
  tap,
} from 'rxjs';

import {
  FlowApiErrorBody,
  FlowCandidate,
  FlowCandidatesResponse,
  FlowDatesResponse,
  FlowIdeasDisplayFilters,
  FlowIdeasRouteState,
  FlowIdeasServerFilters,
  FlowIdeaMetrics,
  FlowReportDate,
  FlowWatchlistsResponse,
} from '../flow-ideas.models';
import { filterFlowCandidates } from '../utilities/filter-flow-candidates';
import { FlowIdeasApiService } from './flow-ideas-api.service';

const DEFAULT_SERVER_FILTERS: FlowIdeasServerFilters = {
  tradingDate: '',
  symbol: '',
  event: '',
  activeOnly: true,
};

const DEFAULT_DISPLAY_FILTERS: FlowIdeasDisplayFilters = {
  includeIndexEtfs: true,
  watchlist: 'all',
  portfolio: 'all',
};

const CHANGE_EVENTS = new Set([
  'returned',
  'reversed',
  'strengthened',
  'weakened',
]);

@Injectable({ providedIn: 'root' })
export class FlowIdeasFacade {
  private readonly subscriptions = new Subscription();
  private readonly serverFiltersSubject =
    new BehaviorSubject<FlowIdeasServerFilters>(DEFAULT_SERVER_FILTERS);
  private readonly displayFiltersSubject =
    new BehaviorSubject<FlowIdeasDisplayFilters>(DEFAULT_DISPLAY_FILTERS);
  private readonly reloadSubject = new BehaviorSubject<number>(0);

  readonly serverFilters = signal<FlowIdeasServerFilters>(
    DEFAULT_SERVER_FILTERS,
  );
  readonly displayFilters = signal<FlowIdeasDisplayFilters>(
    DEFAULT_DISPLAY_FILTERS,
  );
  readonly dates = signal<readonly FlowReportDate[]>([]);
  readonly datesLoading = signal(false);
  readonly datesError = signal<string | null>(null);
  readonly candidatesLoading = signal(false);
  readonly candidatesError = signal<string | null>(null);
  readonly candidateResponse = signal<FlowCandidatesResponse | null>(null);
  readonly watchlists = signal<FlowWatchlistsResponse | null>(null);
  readonly watchlistsLoading = signal(false);
  readonly watchlistsError = signal<string | null>(null);
  readonly selectedSymbol = signal<string | null>(null);

  readonly routeStateChanges$: Observable<FlowIdeasRouteState> = combineLatest([
    this.serverFiltersSubject,
    this.displayFiltersSubject,
  ]).pipe(
    map(([server, display]) => ({ server, display })),
    distinctUntilChanged(sameRouteState),
  );

  readonly brokerageEnrichment = computed(
    () => this.candidateResponse()?.brokerage_enrichment ?? null,
  );

  readonly visibleCandidates = computed(() => {
    const rows = this.candidateResponse()?.rows ?? [];
    return filterFlowCandidates(
      rows,
      this.displayFilters(),
      this.watchlists(),
    );
  });

  readonly selectedCandidate = computed<FlowCandidate | null>(() => {
    const rows = this.visibleCandidates();
    if (!rows.length) {
      return null;
    }

    const selected = this.selectedSymbol();
    return rows.find(row => row.symbol === selected) ?? rows[0];
  });

  readonly metrics = computed<FlowIdeaMetrics>(() => {
    const rows = this.visibleCandidates();
    return {
      active: rows.length,
      persistent: rows.filter(
        row => (row.appearance_streak ?? 0) >= 2,
      ).length,
      unusual: rows.filter(row => row.in_unusual === true).length,
      changed: rows.filter(row =>
        CHANGE_EVENTS.has(row.change_event ?? ''),
      ).length,
    };
  });

  constructor(private readonly api: FlowIdeasApiService) {
    this.subscriptions.add(
      merge(
        this.serverFiltersSubject.pipe(distinctUntilChanged(sameServerFilters)),
        this.reloadSubject.pipe(
          filter(revision => revision > 0),
          map(() => this.serverFilters()),
        ),
      )
        .pipe(
          filter(filters => Boolean(filters.tradingDate)),
          switchMap(filters => this.loadCandidates(filters)),
        )
        .subscribe(),
    );
  }

  loadDates(): void {
    this.datesLoading.set(true);
    this.datesError.set(null);

    const subscription = this.api
      .dates()
      .pipe(
        finalize(() => this.datesLoading.set(false)),
        catchError(error => {
          this.dates.set([]);
          this.datesError.set(toSafeMessage(error));
          return EMPTY;
        }),
      )
      .subscribe(response => this.applyDates(response));

    this.subscriptions.add(subscription);
  }

  loadWatchlists(): void {
    this.watchlistsLoading.set(true);
    this.watchlistsError.set(null);
    const subscription = this.api.watchlists().pipe(
      finalize(() => this.watchlistsLoading.set(false)),
      catchError(error => {
        this.watchlists.set(null);
        this.watchlistsError.set(toSafeMessage(error));
        return EMPTY;
      }),
    ).subscribe(response => this.watchlists.set(response));
    this.subscriptions.add(subscription);
  }

  reload(): void {
    this.loadDates();
    this.loadWatchlists();

    if (this.serverFilters().tradingDate) {
      this.reloadSubject.next(this.reloadSubject.value + 1);
    }
  }

  refreshAfterUpload(
    reportDate: string | null,
    latestTradingDate: string | null,
  ): void {
    const subscription = this.api.dates().pipe(
      catchError(error => {
        this.datesError.set(toSafeMessage(error));
        return EMPTY;
      }),
    ).subscribe(response => {
      this.dates.set(response.dates);
      const currentDate = this.serverFilters().tradingDate;
      const available = new Set(response.dates.map(item => item.trading_date));
      const selected = [reportDate, latestTradingDate, this.serverFilters().tradingDate]
        .find((date): date is string => Boolean(date && available.has(date))) ??
        response.dates[0]?.trading_date ?? '';
      this.setServerFilters({ tradingDate: selected });
      if (selected && selected === currentDate) {
        this.reloadSubject.next(this.reloadSubject.value + 1);
      }
    });
    this.subscriptions.add(subscription);
  }

  setServerFilters(patch: Partial<FlowIdeasServerFilters>): void {
    const current = this.serverFilters();
    const next: FlowIdeasServerFilters = {
      ...current,
      ...patch,
      tradingDate: (patch.tradingDate ?? current.tradingDate).trim(),
      symbol: (patch.symbol ?? current.symbol).trim().toUpperCase(),
      event: (patch.event ?? current.event).trim(),
    };

    if (sameServerFilters(next, current)) {
      return;
    }

    this.serverFilters.set(next);
    this.candidatesError.set(null);
    this.serverFiltersSubject.next(next);
  }

  setDisplayFilters(patch: Partial<FlowIdeasDisplayFilters>): void {
    const next = { ...this.displayFilters(), ...patch };
    if (sameDisplayFilters(next, this.displayFilters())) {
      return;
    }

    this.displayFilters.set(next);
    this.displayFiltersSubject.next(next);
  }

  selectCandidate(symbol: string): void {
    this.selectedSymbol.set(symbol.toUpperCase());
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private applyDates(response: FlowDatesResponse): void {
    this.dates.set(response.dates);

    if (!this.serverFilters().tradingDate && response.dates[0]) {
      this.setServerFilters({ tradingDate: response.dates[0].trading_date });
    }
  }

  private loadCandidates(
    filters: FlowIdeasServerFilters,
  ): Observable<FlowCandidatesResponse> {
    this.candidatesLoading.set(true);
    this.candidatesError.set(null);
    this.candidateResponse.set(null);

    return this.api.candidates(filters).pipe(
      tap(response => this.candidateResponse.set(response)),
      catchError(error => {
        this.candidatesError.set(toSafeMessage(error));
        return EMPTY;
      }),
      finalize(() => this.candidatesLoading.set(false)),
    );
  }
}

function sameRouteState(
  left: FlowIdeasRouteState,
  right: FlowIdeasRouteState,
): boolean {
  return (
    sameServerFilters(left.server, right.server) &&
    sameDisplayFilters(left.display, right.display)
  );
}

function sameServerFilters(
  left: FlowIdeasServerFilters,
  right: FlowIdeasServerFilters,
): boolean {
  return (
    left.tradingDate === right.tradingDate &&
    left.symbol === right.symbol &&
    left.event === right.event &&
    left.activeOnly === right.activeOnly
  );
}

function sameDisplayFilters(
  left: FlowIdeasDisplayFilters,
  right: FlowIdeasDisplayFilters,
): boolean {
  return (
    left.includeIndexEtfs === right.includeIndexEtfs &&
    left.watchlist === right.watchlist &&
    left.portfolio === right.portfolio
  );
}

function toSafeMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as FlowApiErrorBody | null;
    return (
      body?.error?.message ??
      body?.detail ??
      'The FlowPatrol research service is unavailable.'
    );
  }

  return 'The FlowPatrol research service is unavailable.';
}
