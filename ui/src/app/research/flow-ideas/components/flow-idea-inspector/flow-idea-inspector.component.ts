import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { EMPTY, Subscription, catchError, finalize, forkJoin, of } from 'rxjs';

import {
  FlowApiErrorBody,
  FlowCandidate,
  FlowContractsResponse,
  FlowSymbolHistoryResponse,
  FlowWatchlistAddResponse,
  FlowWatchlistsResponse,
} from '../../flow-ideas.models';
import { FlowIdeasApiService } from '../../data-access/flow-ideas-api.service';
import { currentEquityHubUrl } from '../../utilities/equity-hub-url';

@Component({
  selector: 'app-flow-idea-inspector',
  templateUrl: './flow-idea-inspector.component.html',
  styleUrls: ['./flow-idea-inspector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowIdeaInspectorComponent implements OnChanges, OnDestroy {
  @Input() candidate: FlowCandidate | null = null;
  @Input() watchlists: FlowWatchlistsResponse | null = null;
  @Input() watchlistsLoading = false;
  @Input() watchlistsError: string | null = null;

  @Output() readonly watchlistChanged = new EventEmitter<void>();

  private loadSubscription: Subscription | null = null;
  private readonly subscriptions = new Subscription();

  readonly history = signal<FlowSymbolHistoryResponse | null>(null);
  readonly contracts = signal<FlowContractsResponse | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly contractsError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly watchlistAdding = signal(false);
  readonly watchlistResult = signal<FlowWatchlistAddResponse | null>(null);
  readonly watchlistResultError = signal<string | null>(null);

  constructor(private readonly api: FlowIdeasApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['candidate']) this.loadEvidence();
  }

  addToWatchlist(watchlistName: string): void {
    const symbol = this.candidate?.symbol;
    if (!symbol || this.watchlistAdding()) return;

    this.watchlistAdding.set(true);
    this.watchlistResult.set(null);
    this.watchlistResultError.set(null);
    const subscription = this.api.addWatchlistSymbol(watchlistName, symbol).pipe(
      catchError(error => {
        this.watchlistResultError.set(toSafeMessage(error));
        return EMPTY;
      }),
      finalize(() => this.watchlistAdding.set(false)),
    ).subscribe(result => {
      this.watchlistResult.set(result);
      this.watchlistChanged.emit();
    });
    this.subscriptions.add(subscription);
  }

  equityHubUrl(): string {
    return this.candidate ? currentEquityHubUrl(this.candidate.symbol) : '';
  }

  priorityLabel(priority: number | null): string {
    if (priority == null) return 'Unscored';
    if (priority >= 70) return 'High signal';
    if (priority >= 50) return 'Notable';
    return 'Monitor';
  }

  priorityTone(priority: number | null): string {
    if (priority == null) return 'priority-unscored';
    if (priority >= 70) return 'priority-high';
    if (priority >= 50) return 'priority-medium';
    return 'priority-low';
  }

  ngOnDestroy(): void {
    this.loadSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  private loadEvidence(): void {
    this.loadSubscription?.unsubscribe();
    this.history.set(null);
    this.contracts.set(null);
    this.historyError.set(null);
    this.contractsError.set(null);
    this.watchlistResult.set(null);
    this.watchlistResultError.set(null);

    if (!this.candidate) {
      this.loading.set(false);
      return;
    }

    const { symbol, trading_date: tradingDate } = this.candidate;
    this.loading.set(true);
    this.loadSubscription = forkJoin({
      history: this.api.history(symbol).pipe(
        catchError(error => {
          this.historyError.set(toSafeMessage(error));
          return of(null);
        }),
      ),
      contracts: this.api.contracts(tradingDate, symbol).pipe(
        catchError(error => {
          this.contractsError.set(toSafeMessage(error));
          return of(null);
        }),
      ),
    }).pipe(finalize(() => this.loading.set(false))).subscribe(result => {
      this.history.set(result.history);
      this.contracts.set(result.contracts);
    });
  }
}

function toSafeMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as FlowApiErrorBody | null;
    return body?.error?.message ?? body?.detail ?? 'Research detail is unavailable.';
  }
  return 'Research detail is unavailable.';
}
