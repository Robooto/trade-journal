import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';


import {
  TraceContractBase,
  TraceGammaContextResponse,
  TraceGammaProfileResponse,
  TraceHistogramResponse,
  TraceRealizedVolatilityResponse,
  TraceResearchStatusResponse,
  TraceSessionsResponse,
  TraceSummaryResponse,
  TraceTimeseriesResponse,
} from '../trace.models';
import { TraceApiService } from './trace-api.service';
import { TraceFacade } from './trace.facade';

const date = '2026-07-24';

function contractBase<Schema extends string>(schema: Schema): TraceContractBase<Schema> {
  return {
    schema_version: schema,
    status: 'ready',
    date,
    generated_at: '2026-07-25T18:00:00Z',
    freshness: {
      generated_at: '2026-07-25T18:00:00Z',
      latest_capture_ts: '2026-07-24T13:00:05-07:00',
      session_relation: 'historical',
      latest_capture_age_seconds: null,
    },
    data_quality: {
      status: 'ready',
      row_count: 41,
      required_fields: ['ts', 'capture_id', 'spot'],
      missing_required_values: {},
      duplicate_capture_ids: 0,
      warnings: [],
    },
    warnings: [],
  };
}

const sessionsFixture: TraceSessionsResponse = {
  schema_version: 'trace-sessions.v1',
  status: 'ready',
  generated_at: '2026-07-25T18:00:00Z',
  latest_date: date,
  sessions: [{
    date,
    status: 'ready',
    capture_count: 41,
    unique_capture_count: 41,
    start_ts: '2026-07-24T06:20:05-07:00',
    end_ts: '2026-07-24T13:00:05-07:00',
    freshness: contractBase('fixture').freshness,
    data_quality: contractBase('fixture').data_quality,
    warnings: [],
  }],
  warnings: [],
};

const summaryFixture: TraceSummaryResponse = {
  ...contractBase('trace-summary.v1'),
  rows: 41,
  spot_change: -3,
};
const timeseriesFixture: TraceTimeseriesResponse = {
  ...contractBase('trace-timeseries.v1'),
  rows: [
    {
      ts: '2026-07-24T12:50:04-07:00',
      capture_id: 'capture-1',
      spot: 7410,
    } as TraceTimeseriesResponse['rows'][number],
    {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
    } as TraceTimeseriesResponse['rows'][number],
  ],
};
const histogramFixture: TraceHistogramResponse = {
  ...contractBase('trace-histogram-map.v1'),
  rows: [],
};
const gammaFixture: TraceGammaContextResponse = {
  ...contractBase('trace-gamma-context.v1'),
  rows: [],
};
const gammaProfileFixture: TraceGammaProfileResponse = {
  ...contractBase('trace-gamma-profile.v1'),
  ts: '2026-07-24T13:00:05-07:00',
  capture_id: 'capture-2',
  spot: 7412,
  window_points: 60,
  cross_spot_slope: 47_042_808,
  source: { mode: 'fixture', timestamp: null, time: null },
  rows: [
    { spot: 7410, gamma: -120_000_000 },
    { spot: 7412, gamma: 25_000_000 },
    { spot: 7415, gamma: 140_000_000 },
  ],
};
const volatilityFixture: TraceRealizedVolatilityResponse = {
  ...contractBase('trace-realized-volatility.v1'),
  contract_version: 'trace-realized-volatility.v1',
  as_of: '2026-07-24T13:00:05-07:00',
  methodology: {},
  history: {},
  thresholds: {},
  provenance: {},
  rows: [{
    date,
    ts: '2026-07-24T13:00:05-07:00',
    as_of: '2026-07-24T13:00:05-07:00',
    capture_id: 'capture-2',
    realized_vol_bps: 6.4,
    return_observations: 6,
    lookback_returns: 6,
    classification_status: 'ready',
    realized_vol_regime: 'mid_realized',
    history_sufficient: true,
    current_window_sufficient: true,
  }],
};

class TraceApiStub {
  readonly summaryStreams: Observable<TraceSummaryResponse>[] = [];
  readonly summaryDates: string[] = [];
  readonly gammaProfileStreams: Observable<TraceGammaProfileResponse>[] = [];
  readonly gammaProfileRequests: { date: string; ts: string }[] = [];
  realizedVolatilityFails = false;
  readonly paperScorecardCalls: Array<{ fromDate?: string; toDate?: string }> = [];
  readonly paperReplayStreams: Subject<any>[] = [];

  sessions(): Observable<TraceSessionsResponse> { return of(sessionsFixture); }
  summary(selectedDate: string): Observable<TraceSummaryResponse> {
    this.summaryDates.push(selectedDate);
    return this.summaryStreams.shift() ?? of(summaryFixture);
  }
  timeseries(): Observable<TraceTimeseriesResponse> { return of(timeseriesFixture); }
  histogram(): Observable<TraceHistogramResponse> { return of(histogramFixture); }
  gammaContext(): Observable<TraceGammaContextResponse> { return of(gammaFixture); }
  gammaProfile(selectedDate: string, ts: string): Observable<TraceGammaProfileResponse> {
    this.gammaProfileRequests.push({ date: selectedDate, ts });
    return this.gammaProfileStreams.shift() ?? of({
      ...gammaProfileFixture,
      ts,
      capture_id: ts.includes('12:50') ? 'capture-1' : 'capture-2',
    });
  }  realizedVolatility(): Observable<TraceRealizedVolatilityResponse> {
    return this.realizedVolatilityFails
      ? throwError(() => new HttpErrorResponse({
          status: 404,
          error: { detail: 'Realized volatility is unavailable.' },
        }))
      : of(volatilityFixture);
  }
  paperScorecard(fromDate?: string, toDate?: string): Observable<any> {
    this.paperScorecardCalls.push({ fromDate, toDate });
    return of({ schema_version: 'spx-paper-scorecard.v1', status: 'no_evidence', cohorts: [], warnings: [], session_count: 0, source_status_counts: {}, from_date: fromDate ?? '', to_date: toDate ?? '' });
  }
  paperReplayEntries(): Observable<any> {
    return of({ schema_version: 'spx-paper-replay-entries.v1', date, status: 'no_evidence', entries: [] });
  }
  paperReplay(): Observable<any> { return this.paperReplayStreams.shift() ?? of(null); }
}

describe('TraceFacade', () => {
  it('includes the non-scoring HIRO cancellation checkpoint in visible evidence', () => {
    const facade = new TraceFacade(
      new TraceApiStub() as unknown as TraceApiService,
    );
    const researchStatus: TraceResearchStatusResponse = {
      schema_version: 'trace-study-registry.v1',
      as_of: '2026-08-31',
      evidence_version: 'week-end-2026-08-28',
      study_count: 2,
      scoring_enabled_count: 0,
      studies: [
        {
          id: 'hiro-cancellation-strength',
          label: 'HIRO cancellation strength',
          status: 'preregistered',
          scoring_enabled: false,
          checkpoint: {
            completed_sessions: 0,
            required_sessions: 40,
            remaining_sessions: 40,
            start_date: '2026-09-01',
            definition_frozen: true,
          },
        },
        {
          id: 'unrelated-study',
          label: 'Unrelated',
          status: 'research',
          scoring_enabled: false,
        },
      ],
    };

    facade.researchStatus.set(researchStatus);

    // Grouping by evidence tier happens in the research summary; the facade exposes every study.
    expect(facade.researchStatus()?.studies.map(study => study.id)).toEqual(['hiro-cancellation-strength', 'unrelated-study']);
    expect(facade.researchStatus()?.studies[0].checkpoint?.required_sessions).toBe(40);
    facade.ngOnDestroy();
  });

  it('selects the newest session and loads the independent source bundle', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.loadSessions();

    expect(facade.selectedDate()).toBe(date);
    expect(facade.selectedSession()?.capture_count).toBe(41);
    expect(facade.bundle()?.summary?.spot_change).toBe(-3);
    expect(facade.selectedCapture()?.capture_id).toBe('capture-2');
    expect(facade.selectedRealizedVolatility()?.realized_vol_bps).toBe(6.4);
    expect(facade.gammaProfile()?.capture_id).toBe('capture-2');
    expect(api.gammaProfileRequests).toEqual([{
      date,
      ts: '2026-07-24T13:00:05-07:00',
    }]);
    expect(facade.availableResourceCount()).toBe(5);
    facade.ngOnDestroy();
  });

  it('preserves an explicitly selected scorecard range across session refresh', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService);
    facade.loadPaperScorecard('2026-07-01', '2026-07-05');
    facade.loadSessions();
    expect(api.paperScorecardCalls.at(-1)).toEqual({ fromDate: '2026-07-01', toDate: '2026-07-05' });
    facade.ngOnDestroy();
  });

  it('clears completed replay and rejects delayed results after cutoff/session changes', () => {
    const api = new TraceApiStub();
    const delayed = new Subject<any>();
    api.paperReplayStreams.push(delayed);
    const facade = new TraceFacade(api as unknown as TraceApiService);
    facade.selectDate(date);
    facade.loadPaperReplay(date, 'capture-2', 'entry-1');
    facade.selectCapture(0);
    delayed.next({ schema_version: 'spx-paper-replay.v1' });
    expect(facade.paperReplay()).toBeNull();
    facade.ngOnDestroy();
  });

  it('reloads the same session in place: stays on a pinned capture, follows the latest otherwise', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService);
    facade.selectDate(date);
    const rows = timeseriesFixture.rows;
    const later = (n: number) => ({ ...rows[1], ts: `2026-07-24T13:0${n}:05-07:00`, capture_id: `capture-${n + 2}` });
    const grow = (extra: number) => vi.spyOn(api, 'timeseries').mockReturnValue(of({ ...timeseriesFixture,
      rows: [...rows, ...Array.from({ length: extra }, (_, i) => later(i + 1))] } as TraceTimeseriesResponse));

    facade.selectCapture(0);
    const before = facade.bundle();
    grow(1);
    facade.reload();
    expect(facade.bundle()).not.toBe(before);
    expect(facade.captureRows().length).toBe(3);
    expect(facade.selectedCapture()?.capture_id).toBe(rows[0].capture_id);

    facade.selectCapture(2);
    grow(2);
    facade.reload();
    expect(facade.selectedCaptureIndex()).toBe(3);
    expect(facade.selectedCapture()?.capture_id).toBe('capture-4');
    facade.ngOnDestroy();
  });

  it('clamps timeline navigation and reloads gamma for the selected capture', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.selectDate(date);
    expect(facade.selectedCaptureIndex()).toBe(1);

    facade.stepCapture(-1);
    expect(facade.selectedCapture()?.capture_id).toBe('capture-1');
    expect(facade.gammaProfile()?.capture_id).toBe('capture-1');
    expect(api.gammaProfileRequests.at(-1)?.ts).toBe('2026-07-24T12:50:04-07:00');

    facade.selectCapture(99);
    expect(facade.selectedCaptureIndex()).toBe(1);
    facade.ngOnDestroy();
  });
  it('cancels an older session bundle when the selected date changes', () => {
    const api = new TraceApiStub();
    const first = new Subject<TraceSummaryResponse>();
    const second = new Subject<TraceSummaryResponse>();
    api.summaryStreams.push(first, second);
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.selectDate('2026-07-23');
    facade.selectDate(date);

    first.next(summaryFixture);
    first.complete();
    expect(facade.bundle()).toBeNull();

    second.next(summaryFixture);
    second.complete();
    expect(api.summaryDates).toEqual(['2026-07-23', date]);
    expect(facade.bundle()?.date).toBe(date);
    facade.ngOnDestroy();
  });

  it('cancels an older gamma profile request when the selected capture changes', () => {
    const api = new TraceApiStub();
    const older = new Subject<TraceGammaProfileResponse>();
    const newer = new Subject<TraceGammaProfileResponse>();
    api.gammaProfileStreams.push(older, newer);
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.selectDate(date);
    facade.stepCapture(-1);

    older.next(gammaProfileFixture);
    older.complete();
    expect(facade.gammaProfile()).toBeNull();

    newer.next({
      ...gammaProfileFixture,
      ts: '2026-07-24T12:50:04-07:00',
      capture_id: 'capture-1',
    });
    newer.complete();
    expect(facade.gammaProfile()?.capture_id).toBe('capture-1');
    facade.ngOnDestroy();
  });
  it('retains successful sources when one optional source fails', () => {
    const api = new TraceApiStub();
    api.realizedVolatilityFails = true;
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.selectDate(date);

    expect(facade.bundle()?.summary).toEqual(summaryFixture);
    expect(facade.bundle()?.realizedVolatility).toBeNull();
    expect(facade.bundle()?.errors.realizedVolatility).toBe(
      'Realized volatility is unavailable.',
    );
    expect(facade.availableResourceCount()).toBe(4);
    expect(facade.sessionError()).toBeNull();
    facade.ngOnDestroy();
  });
});
