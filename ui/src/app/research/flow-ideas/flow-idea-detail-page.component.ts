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
  Observable,
  Subscription,
  catchError,
  distinctUntilChanged,
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
              candidate: this.asResult(
                this.api.candidates({
                  tradingDate: detail.tradingDate,
                  symbol: detail.symbol,
                  event: '',
                  activeOnly: false,
                }),
              ),
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
          this.loading.set(false);
        }),
    );
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
