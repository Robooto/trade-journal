import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  distinctUntilChanged,
  filter,
  finalize,
  forkJoin,
  map,
  merge,
  of,
  switchMap,
  tap,
} from 'rxjs';

import {
  TraceContractBase,
  TraceDashboardRow,
  TraceGammaProfileResponse,
  TraceRealizedVolatilityRow,
  TraceResourceStatus,
  TraceSessionBundle,
  TraceSessionDescriptor,
  TraceSessionSourceErrors,
  TraceSessionsResponse,
} from '../trace.models';
import { TraceApiService } from './trace-api.service';

interface CapturedResource<T> {
  readonly value: T | null;
  readonly error: string | null;
}

@Injectable({ providedIn: 'root' })
export class TraceFacade implements OnDestroy {
  private readonly subscriptions = new Subscription();
  private readonly selectedDateSubject = new BehaviorSubject<string>('');
  private readonly gammaProfileSubject = new Subject<{ date: string; ts: string } | null>();
  private readonly reloadSubject = new Subject<void>();

  readonly sessions = signal<readonly TraceSessionDescriptor[]>([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly selectedDate = signal('');
  readonly sessionLoading = signal(false);
  readonly sessionError = signal<string | null>(null);
  readonly bundle = signal<TraceSessionBundle | null>(null);
  readonly selectedCaptureIndex = signal(0);
  readonly gammaProfile = signal<TraceGammaProfileResponse | null>(null);
  readonly gammaProfileLoading = signal(false);
  readonly gammaProfileError = signal<string | null>(null);

  readonly selectedSession = computed<TraceSessionDescriptor | null>(() =>
    this.sessions().find(session => session.date === this.selectedDate()) ?? null,
  );

  readonly captureRows = computed<readonly TraceDashboardRow[]>(() =>
    this.bundle()?.timeseries?.rows ?? [],
  );

  readonly selectedCapture = computed<TraceDashboardRow | null>(() => {
    const rows = this.captureRows();
    return rows[this.selectedCaptureIndex()] ?? null;
  });

  readonly selectedRealizedVolatility = computed<TraceRealizedVolatilityRow | null>(() => {
    const captureId = this.selectedCapture()?.capture_id;
    if (!captureId) return null;
    return this.bundle()?.realizedVolatility?.rows.find(row => row.capture_id === captureId) ?? null;
  });

  readonly resourceStatuses = computed<readonly TraceResourceStatus[]>(() => {
    const bundle = this.bundle();
    if (!bundle) return [];
    return [
      resourceStatus('summary', 'Summary', bundle.summary, bundle.errors.summary),
      resourceStatus('timeseries', 'Timeline', bundle.timeseries, bundle.errors.timeseries),
      resourceStatus('histogram', 'Signed GEX', bundle.histogram, bundle.errors.histogram),
      resourceStatus('gammaContext', 'Gamma context', bundle.gammaContext, bundle.errors.gammaContext),
      resourceStatus(
        'realizedVolatility',
        'Realized volatility',
        bundle.realizedVolatility,
        bundle.errors.realizedVolatility,
      ),
    ];
  });

  readonly availableResourceCount = computed(() =>
    this.resourceStatuses().filter(resource => resource.status !== 'unavailable').length,
  );

  constructor(private readonly api: TraceApiService) {
    this.subscriptions.add(
      merge(
        this.selectedDateSubject.pipe(distinctUntilChanged()),
        this.reloadSubject.pipe(map(() => this.selectedDateSubject.value)),
      )
        .pipe(
          filter(date => Boolean(date)),
          switchMap(date => this.loadSession(date)),
        )
        .subscribe(),
    );
    this.subscriptions.add(
      this.gammaProfileSubject.pipe(
        switchMap(selection => {
          if (!selection) {
            this.gammaProfileLoading.set(false);
            this.gammaProfileError.set(null);
            this.gammaProfile.set(null);
            return EMPTY;
          }
          this.gammaProfileLoading.set(true);
          this.gammaProfileError.set(null);
          this.gammaProfile.set(null);
          return this.api.gammaProfile(selection.date, selection.ts).pipe(
            map(profile => ({ profile, error: null as string | null })),
            catchError(error => of({
              profile: null,
              error: toSafeMessage(error, 'Gamma profile is unavailable for this capture.'),
            })),
          );
        }),
      ).subscribe(result => {
        this.gammaProfile.set(result.profile);
        this.gammaProfileError.set(result.error);
        this.gammaProfileLoading.set(false);
      }),
    );
  }

  loadSessions(): void {
    this.sessionsLoading.set(true);
    this.sessionsError.set(null);
    const subscription = this.api.sessions().pipe(
      finalize(() => this.sessionsLoading.set(false)),
      catchError(error => {
        this.sessions.set([]);
        this.sessionsError.set(toSafeMessage(error, 'TRACE sessions are unavailable.'));
        return EMPTY;
      }),
    ).subscribe(response => this.applySessions(response));
    this.subscriptions.add(subscription);
  }

  selectDate(date: string): void {
    const normalized = date.trim();
    if (!normalized || normalized === this.selectedDate()) return;
    this.selectedDate.set(normalized);
    this.sessionError.set(null);
    this.selectedDateSubject.next(normalized);
  }

  selectCapture(index: number): void {
    const lastIndex = this.captureRows().length - 1;
    if (lastIndex < 0) {
      this.selectedCaptureIndex.set(0);
      return;
    }
    const normalized = Math.max(0, Math.min(lastIndex, Math.round(index)));
    if (normalized === this.selectedCaptureIndex()) return;
    this.selectedCaptureIndex.set(normalized);
    this.requestGammaProfile();
  }

  stepCapture(offset: number): void {
    this.selectCapture(this.selectedCaptureIndex() + offset);
  }

  reload(): void {
    this.loadSessions();
    if (this.selectedDate()) this.reloadSubject.next();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private applySessions(response: TraceSessionsResponse): void {
    this.sessions.set(response.sessions);
    if (!response.sessions.length) {
      this.selectedDate.set('');
      this.bundle.set(null);
      this.selectedCaptureIndex.set(0);
      this.resetGammaProfile();
      this.sessionError.set('No TRACE sessions are available.');
      return;
    }

    const current = this.selectedDate();
    const selected = response.sessions.some(session => session.date === current)
      ? current
      : response.latest_date ?? response.sessions[0].date;
    if (selected === current && this.bundle()) return;
    this.selectDate(selected);
  }

  private loadSession(date: string): Observable<TraceSessionBundle> {
    this.sessionLoading.set(true);
    this.sessionError.set(null);
    this.bundle.set(null);
    this.selectedCaptureIndex.set(0);
    this.resetGammaProfile();

    return forkJoin({
      summary: capture(this.api.summary(date)),
      timeseries: capture(this.api.timeseries(date)),
      histogram: capture(this.api.histogram(date)),
      gammaContext: capture(this.api.gammaContext(date)),
      realizedVolatility: capture(this.api.realizedVolatility(date)),
    }).pipe(
      map(resources => toBundle(date, resources)),
      tap(bundle => {
        this.bundle.set(bundle);
        this.selectedCaptureIndex.set(Math.max(0, (bundle.timeseries?.rows.length ?? 1) - 1));
        this.requestGammaProfile();
        if (!hasAnyResource(bundle)) {
          this.sessionError.set('The selected TRACE session could not be loaded.');
        }
      }),
      finalize(() => this.sessionLoading.set(false)),
    );
  }

  private requestGammaProfile(): void {
    const capture = this.selectedCapture();
    const date = this.selectedDate();
    if (!capture || !date) {
      this.resetGammaProfile();
      return;
    }
    this.gammaProfileSubject.next({ date, ts: capture.ts });
  }

  private resetGammaProfile(): void {
    this.gammaProfileSubject.next(null);
  }
}

function capture<T>(source: Observable<T>): Observable<CapturedResource<T>> {
  return source.pipe(
    map(value => ({ value, error: null })),
    catchError(error => of({
      value: null,
      error: toSafeMessage(error, 'This TRACE resource is unavailable.'),
    })),
  );
}

function toBundle(
  date: string,
  resources: {
    summary: CapturedResource<NonNullable<TraceSessionBundle['summary']>>;
    timeseries: CapturedResource<NonNullable<TraceSessionBundle['timeseries']>>;
    histogram: CapturedResource<NonNullable<TraceSessionBundle['histogram']>>;
    gammaContext: CapturedResource<NonNullable<TraceSessionBundle['gammaContext']>>;
    realizedVolatility: CapturedResource<NonNullable<TraceSessionBundle['realizedVolatility']>>;
  },
): TraceSessionBundle {
  const errors: TraceSessionSourceErrors = {
    ...(resources.summary.error ? { summary: resources.summary.error } : {}),
    ...(resources.timeseries.error ? { timeseries: resources.timeseries.error } : {}),
    ...(resources.histogram.error ? { histogram: resources.histogram.error } : {}),
    ...(resources.gammaContext.error ? { gammaContext: resources.gammaContext.error } : {}),
    ...(resources.realizedVolatility.error
      ? { realizedVolatility: resources.realizedVolatility.error }
      : {}),
  };
  return {
    date,
    summary: resources.summary.value,
    timeseries: resources.timeseries.value,
    histogram: resources.histogram.value,
    gammaContext: resources.gammaContext.value,
    realizedVolatility: resources.realizedVolatility.value,
    errors,
  };
}

function hasAnyResource(bundle: TraceSessionBundle): boolean {
  return Boolean(
    bundle.summary ||
    bundle.timeseries ||
    bundle.histogram ||
    bundle.gammaContext ||
    bundle.realizedVolatility,
  );
}

function resourceStatus(
  key: TraceResourceStatus['key'],
  label: string,
  resource: TraceContractBase<string> | null,
  error: string | undefined,
): TraceResourceStatus {
  return {
    key,
    label,
    status: resource?.status ?? 'unavailable',
    warningCount: resource?.warnings.length ?? (error ? 1 : 0),
  };
}

function toSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.detail;
    return typeof detail === 'string' && detail ? detail : fallback;
  }
  return fallback;
}