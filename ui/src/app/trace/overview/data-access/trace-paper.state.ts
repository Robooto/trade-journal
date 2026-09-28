import { signal } from '@angular/core';
import { Subscription, EMPTY, finalize, catchError } from 'rxjs';
import type { PaperCatalog } from './generated/research-contracts';
import type { TracePaperReplayResponse, TracePaperReplayEntriesResponse, TracePaperScorecardResponse } from '../trace.models';
import { TraceApiService } from './trace-api.service';
import { toSafeMessage } from './api-errors';

/** Owned by one TraceFacade; keeps paper requests and their stale-response guards together. */
export class TracePaperState {
  private readonly subscriptions = new Subscription();
  private paperScorecardRequest = 0;
  private paperReplayRequest = 0;
  private paperReplayEntriesRequest = 0;
  readonly paperScorecard = signal<TracePaperScorecardResponse | null>(null);
  readonly paperCatalog = signal<PaperCatalog | null>(null);
  readonly paperScorecardLoading = signal(false);
  readonly paperScorecardError = signal<string | null>(null);
  readonly paperReplay = signal<TracePaperReplayResponse | null>(null);
  readonly paperReplayLoading = signal(false);
  readonly paperReplayError = signal<string | null>(null);
  readonly paperReplayEntries = signal<TracePaperReplayEntriesResponse | null>(null);
  readonly paperReplayEntriesLoading = signal(false);
  readonly paperReplayEntriesError = signal<string | null>(null);
  private paperScorecardRange: { fromDate?: string; toDate?: string } | null = null;

  constructor(private readonly api: TraceApiService) {}

  loadForSessions(orderedDates: readonly string[]): void {
    if (!orderedDates.length) return;
    this.loadPaperScorecard(
      this.paperScorecardRange?.fromDate ?? orderedDates[Math.max(0, orderedDates.length - 10)],
      this.paperScorecardRange?.toDate ?? orderedDates[orderedDates.length - 1],
    );
  }

  destroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadPaperScorecard(fromDate?: string, toDate?: string): void {
    if (typeof this.api.paperScorecard !== 'function') return;
    if (fromDate || toDate) this.paperScorecardRange = { fromDate, toDate };
    else if (this.paperScorecardRange) ({ fromDate, toDate } = this.paperScorecardRange);
    const requestId = ++this.paperScorecardRequest;
    this.paperCatalog.set(null);
    if (toDate && typeof this.api.paperCatalog === 'function') {
      this.subscriptions.add(this.api.paperCatalog(toDate).subscribe({
        next: catalog => { if (requestId === this.paperScorecardRequest) this.paperCatalog.set(catalog); },
        error: () => { if (requestId === this.paperScorecardRequest) this.paperCatalog.set(null); },
      }));
    }
    this.paperScorecardLoading.set(true);
    this.paperScorecardError.set(null);
    this.paperScorecard.set(null);
    const subscription = this.api.paperScorecard(fromDate, toDate).pipe(
      finalize(() => { if (requestId === this.paperScorecardRequest) this.paperScorecardLoading.set(false); }),
      catchError(error => {
        if (requestId === this.paperScorecardRequest) this.paperScorecardError.set(toSafeMessage(error, 'Paper scorecard is unavailable.'));
        return EMPTY;
      }),
    ).subscribe(response => { if (requestId === this.paperScorecardRequest) this.paperScorecard.set(response); });
    this.subscriptions.add(subscription);
  }

  loadPaperReplay(date: string, captureId: string, entryCaptureId?: string, strategyId?: string): void {
    if (typeof this.api.paperReplay !== 'function') return;
    const requestId = ++this.paperReplayRequest;
    this.paperReplayLoading.set(true);
    this.paperReplayError.set(null);
    this.paperReplay.set(null);
    const subscription = this.api.paperReplay(date, captureId, entryCaptureId, strategyId).pipe(
      finalize(() => { if (requestId === this.paperReplayRequest) this.paperReplayLoading.set(false); }),
      catchError(error => {
        if (requestId === this.paperReplayRequest) this.paperReplayError.set(toSafeMessage(error, 'No recorded paper trade is available for this capture.'));
        return EMPTY;
      }),
    ).subscribe(response => { if (requestId === this.paperReplayRequest) this.paperReplay.set(response); });
    this.subscriptions.add(subscription);
  }

  clearPaperReplay(): void {
    this.paperReplayRequest += 1;
    this.paperReplayLoading.set(false);
    this.paperReplay.set(null);
    this.paperReplayError.set(null);
  }

  loadPaperReplayEntries(date: string): void {
    if (typeof this.api.paperReplayEntries !== 'function') return;
    const requestId = ++this.paperReplayEntriesRequest;
    this.paperReplayEntriesLoading.set(true);
    this.paperReplayEntriesError.set(null);
    const subscription = this.api.paperReplayEntries(date).pipe(
      finalize(() => { if (requestId === this.paperReplayEntriesRequest) this.paperReplayEntriesLoading.set(false); }),
      catchError(error => {
        if (requestId === this.paperReplayEntriesRequest) this.paperReplayEntriesError.set(toSafeMessage(error, 'Recorded paper entries are unavailable.'));
        return EMPTY;
      }),
    ).subscribe(response => { if (requestId === this.paperReplayEntriesRequest) this.paperReplayEntries.set(response); });
    this.subscriptions.add(subscription);
  }

  resetPaperReplay(): void {
    this.clearPaperReplay();
    this.paperReplayEntriesRequest += 1;
    this.paperReplayEntriesLoading.set(false);
    this.paperReplayEntries.set(null);
    this.paperReplayEntriesError.set(null);
  }

}
