import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  EMPTY,
  Observable,
  Subscription,
  catchError,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import {
  FlowApiErrorBody,
  FlowBrokerageContext,
  FlowCandidatesResponse,
  FlowContractsResponse,
  FlowSymbolHistoryResponse,
  FlowWatchlistAddResponse,
  FlowWatchlistsResponse,
} from './flow-ideas.models';
import { FlowIdeasApiService } from './data-access/flow-ideas-api.service';
import { currentEquityHubUrl } from './utilities/equity-hub-url';

interface DetailRoute {
  readonly tradingDate: string;
  readonly symbol: string;
}

interface DetailResult<T> {
  readonly value: T | null;
  readonly error: string | null;
}

@Component({
  selector: 'app-flow-idea-detail-page',
  templateUrl: './flow-idea-detail-page.component.html',
  styleUrls: ['./flow-idea-detail-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowIdeaDetailPageComponent implements OnDestroy {
  private readonly subscriptions = new Subscription();

  readonly tradingDate = signal('');
  readonly symbol = signal('');
  readonly history = signal<FlowSymbolHistoryResponse | null>(null);
  readonly contracts = signal<FlowContractsResponse | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly contractsError = signal<string | null>(null);
  readonly loading = signal(true);
  readonly brokerageContext = signal<FlowBrokerageContext | null>(null);
  readonly brokerageContextMessage = signal(
    'Loading supporting brokerage context...',
  );
  readonly watchlists = signal<FlowWatchlistsResponse | null>(null);
  readonly watchlistsLoading = signal(true);
  readonly watchlistsError = signal<string | null>(null);
  readonly watchlistAdding = signal(false);
  readonly watchlistResult = signal<FlowWatchlistAddResponse | null>(null);
  readonly watchlistResultError = signal<string | null>(null);
  readonly currentEquityHubUrl = computed(() =>
    this.symbol() ? currentEquityHubUrl(this.symbol()) : '',
  );

  constructor(
    private readonly api: FlowIdeasApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.subscriptions.add(
      this.route.paramMap
        .pipe(
          map(params => ({
            tradingDate: params.get('tradingDate')?.trim() ?? '',
            symbol: params.get('symbol')?.trim().toUpperCase() ?? '',
          })),
          distinctUntilChanged(sameDetailRoute),
          tap(detail => this.beginLoad(detail)),
          switchMap(detail =>
            forkJoin({
              history: this.asResult(this.api.history(detail.symbol)),
              contracts: this.asResult(
                this.api.contracts(detail.tradingDate, detail.symbol),
              ),
              candidate: this.asResult(this.candidateRequest(detail)),
              watchlists: this.asResult(this.api.watchlists()),
            }),
          ),
        )
        .subscribe(result => {
          this.history.set(result.history.value);
          this.historyError.set(result.history.error);
          this.contracts.set(result.contracts.value);
          this.contractsError.set(result.contracts.error);
          this.applyBrokerageContext(
            result.candidate.value,
            result.candidate.error,
          );
          this.watchlists.set(result.watchlists.value);
          this.watchlistsError.set(result.watchlists.error);
          this.watchlistsLoading.set(false);
          this.loading.set(false);
        }),
    );
  }

  addToWatchlist(watchlistName: string): void {
    if (this.watchlistAdding() || !this.symbol()) return;

    this.watchlistAdding.set(true);
    this.watchlistResult.set(null);
    this.watchlistResultError.set(null);
    this.api.addWatchlistSymbol(watchlistName, this.symbol()).pipe(
      catchError(error => {
        this.watchlistResultError.set(toSafeMessage(error));
        return EMPTY;
      }),
      finalize(() => this.watchlistAdding.set(false)),
    ).subscribe(result => {
      this.watchlistResult.set(result);
      this.refreshBrokerageReads();
    });
  }

  backToQueue(): void {
    void this.router.navigate(['/research/flow-ideas'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private beginLoad(detail: DetailRoute): void {
    this.tradingDate.set(detail.tradingDate);
    this.symbol.set(detail.symbol);
    this.history.set(null);
    this.contracts.set(null);
    this.historyError.set(null);
    this.contractsError.set(null);
    this.loading.set(true);
    this.brokerageContext.set(null);
    this.brokerageContextMessage.set('Loading supporting brokerage context...');
    this.watchlists.set(null);
    this.watchlistsLoading.set(true);
    this.watchlistsError.set(null);
    this.watchlistResult.set(null);
    this.watchlistResultError.set(null);
  }

  private candidateRequest(detail: DetailRoute): Observable<FlowCandidatesResponse> {
    return this.api.candidates({
      tradingDate: detail.tradingDate,
      symbol: detail.symbol,
      event: '',
      activeOnly: false,
    });
  }

  private refreshBrokerageReads(): void {
    const detail = { tradingDate: this.tradingDate(), symbol: this.symbol() };
    this.watchlistsLoading.set(true);
    forkJoin({
      candidate: this.asResult(this.candidateRequest(detail)),
      watchlists: this.asResult(this.api.watchlists()),
    }).subscribe(result => {
      this.applyBrokerageContext(result.candidate.value, result.candidate.error);
      this.watchlists.set(result.watchlists.value);
      this.watchlistsError.set(result.watchlists.error);
      this.watchlistsLoading.set(false);
    });
  }

  private applyBrokerageContext(
    response: FlowCandidatesResponse | null,
    requestError: string | null,
  ): void {
    const candidate = response?.rows.find(
      row =>
        row.symbol === this.symbol() && row.trading_date === this.tradingDate(),
    );
    this.brokerageContext.set(candidate?.brokerage_context ?? null);

    if (requestError) {
      this.brokerageContextMessage.set(
        `${requestError} FlowPatrol evidence remains available.`,
      );
      return;
    }

    const warning = response?.brokerage_enrichment.warnings.join(' ').trim();
    this.brokerageContextMessage.set(
      warning ||
        'Brokerage context is unavailable for this symbol. FlowPatrol evidence remains available.',
    );
  }

  private asResult<T>(request: Observable<T>): Observable<DetailResult<T>> {
    return request.pipe(
      map(value => ({ value, error: null })),
      catchError(error => of({ value: null, error: toSafeMessage(error) })),
    );
  }
}

function sameDetailRoute(left: DetailRoute, right: DetailRoute): boolean {
  return (
    left.tradingDate === right.tradingDate && left.symbol === right.symbol
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
